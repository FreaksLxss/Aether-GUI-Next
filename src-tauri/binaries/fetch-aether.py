#!/usr/bin/env python3
"""Fetch the pinned engine payload set (aether + pt/lyrebird + pt/psiphon-tunnel-core)
into binaries/engine (Python 3, no packages).

Only public release bytes and engine payloads are read. Existing root binaries,
Tor, Wintun and identity/state files are never modified. A replaced engine
folder is retained as a sibling backup; it is never recursively deleted.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import stat
import struct
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024


def select_asset(manifest):
    system = {"Windows": "windows", "Linux": "linux", "Darwin": "macos"}.get(platform.system())
    arch = {"AMD64": "x86_64", "x86_64": "x86_64", "aarch64": "aarch64", "arm64": "aarch64"}.get(platform.machine())
    key = f"{system}-{arch}"
    override = os.environ.get("AETHER_ASSET")
    if override:
        matches = [(k, a) for k, a in manifest["assets"].items() if a["name"] == override and k.startswith(f"{system}-")]
        if len(matches) != 1:
            raise ValueError("AETHER_ASSET must name a pinned asset for the current OS")
        return matches[0]
    if key not in manifest["assets"]:
        raise ValueError(f"Unsupported platform: {key}")
    return key, manifest["assets"][key]


def verify_checksum(data, expected):
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected:
        raise ValueError(f"SHA256 mismatch: {actual} != {expected}")
    return actual


def check_architecture(data, target):
    os_name, arch = target.split("-", 1)
    if os_name == "windows":
        if len(data) < 64 or data[:2] != b"MZ":
            raise ValueError("Expected PE executable")
        offset = struct.unpack_from("<I", data, 60)[0]
        valid = data[offset:offset + 6] == b"PE\0\0\x64\x86" and arch == "x86_64"
    elif os_name == "linux":
        machine = 62 if arch == "x86_64" else 183
        valid = len(data) >= 20 and data[:6] == b"\x7fELF\x02\x01" and struct.unpack_from("<H", data, 18)[0] == machine
    else:
        machine = 0x01000007 if arch == "x86_64" else 0x0100000C
        valid = len(data) >= 8 and data[:4] == b"\xcf\xfa\xed\xfe" and struct.unpack_from("<I", data, 4)[0] == machine
    if not valid:
        raise ValueError(f"Executable does not match {target}")


def extract_payload(data, target, dest):
    windows = target.startswith("windows-")
    engine = "aether.exe" if windows else "aether"
    pt = "pt/lyrebird.exe" if windows else "pt/lyrebird"
    psiphon = "pt/psiphon-tunnel-core.exe" if windows else "pt/psiphon-tunnel-core"
    required = {engine, pt, psiphon}
    seen = set()
    total = 0

    def accept(name, directory, regular, size, reader):
        nonlocal total
        if directory:
            name = name.removesuffix("/")
        allowed = {engine, pt, psiphon, "pt"}
        if windows:
            allowed.add("run-aether.bat")
        if name not in allowed or name in seen or directory != (name == "pt") or not regular:
            raise ValueError(f"Unsafe, duplicate or unexpected archive member: {name!r}")
        seen.add(name)
        total += size
        if size > MAX_FILE or total > 2 * MAX_FILE:
            raise ValueError("Oversized archive payload")
        if directory:
            return
        payload = reader()
        if len(payload) != size:
            raise ValueError("Truncated archive member")
        if name not in required:
            return
        check_architecture(payload, target)
        path = dest / name
        path.parent.mkdir(exist_ok=True)
        with path.open("xb") as out:
            out.write(payload)
        path.chmod(0o755)

    if windows:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for entry in archive.infolist():
                mode = entry.external_attr >> 16
                kind = stat.S_IFMT(mode)
                regular = kind in (0, stat.S_IFREG, stat.S_IFDIR) and not (entry.flag_bits & 1)
                accept(entry.filename, entry.is_dir(), regular, entry.file_size, lambda e=entry: archive.read(e))
    else:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            for entry in archive:
                accept(entry.name, entry.isdir(), entry.isfile() or entry.isdir(), entry.size,
                       lambda e=entry: archive.extractfile(e).read(MAX_FILE + 1))
    if not required.issubset(seen):
        raise ValueError("Incomplete engine archive: aether, pt/lyrebird and pt/psiphon-tunnel-core are required")
    return engine


def activate(stage, dest):
    backup = dest.with_name(f".engine-backup-{uuid.uuid4().hex}")
    previous = os.path.lexists(dest)
    if previous:
        if dest.is_symlink() or not dest.is_dir():
            raise ValueError("Existing engine destination must be a real directory")
        dest.rename(backup)
    try:
        stage.rename(dest)
    except Exception:
        if previous:
            backup.rename(dest)
        raise
    if previous:
        print(f"Previous installation preserved at {backup}")


def main():
    manifest = json.loads((ROOT.parent / "aether-release.json").read_text(encoding="utf-8"))
    target, asset = select_asset(manifest)
    url = f'https://github.com/{manifest["repository"]}/releases/download/v{manifest["version"]}/{asset["name"]}'
    request = urllib.request.Request(url, headers={"User-Agent": "Aether-GUI"})
    deadline = time.monotonic() + 180
    chunks = []
    size = 0
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError(f"HTTP {response.status}")
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_ARCHIVE or time.monotonic() > deadline:
                raise ValueError("Archive download exceeds size/time limit")
            chunks.append(chunk)
    data = b"".join(chunks)
    digest = verify_checksum(data, asset["sha256"])
    print(f'{asset["name"]} SHA256 {digest}')
    stage = Path(tempfile.mkdtemp(prefix=".engine-stage-", dir=ROOT))
    try:
        engine = extract_payload(data, target, stage)
        native_arch = {"AMD64": "x86_64", "x86_64": "x86_64", "arm64": "aarch64", "aarch64": "aarch64"}.get(platform.machine())
        if target.endswith(f"-{native_arch}"):
            result = subprocess.run([str(stage / engine), "--version"], cwd=stage,
                                    capture_output=True, text=True, timeout=10, check=True)
            if result.stdout.strip() != f'aether {manifest["version"]}':
                raise ValueError(f"Unexpected engine version: {result.stdout.strip()!r}")
            print(result.stdout.strip())
        activate(stage, ROOT / "engine")
        print(f"Complete engine ready at {ROOT / 'engine' / engine}")
    finally:
        if stage.exists():
            shutil.rmtree(stage)


if __name__ == "__main__":
    main()
