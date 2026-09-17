"""Non-network fixture tests for the shared fetch helper."""
import importlib.util
import io
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
from unittest import mock
import zipfile

spec = importlib.util.spec_from_file_location("fetch_aether", Path(__file__).with_name("fetch-aether.py"))
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)


def pe():
    data = bytearray(80)
    data[:2] = b"MZ"
    struct.pack_into("<I", data, 60, 64)
    data[64:70] = b"PE\0\0\x64\x86"
    return bytes(data)


def archive(entries):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name, data in entries:
            z.writestr(name, data)
    return out.getvalue()


class FetchTests(unittest.TestCase):
    def test_complete_pt_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp)
            fetch.extract_payload(archive([("aether.exe", pe()), ("pt/lyrebird.exe", pe()), ("run-aether.bat", b"ignored")]), "windows-x86_64", dest)
            self.assertEqual((dest / "pt/lyrebird.exe").read_bytes(), pe())
            self.assertFalse((dest / "run-aether.bat").exists())

    def test_checksum_mismatch(self):
        with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
            fetch.verify_checksum(b"bad", "0" * 64)

    def test_missing_pt(self):
        with tempfile.TemporaryDirectory() as tmp, self.assertRaisesRegex(ValueError, "Incomplete"):
            fetch.extract_payload(archive([("aether.exe", pe())]), "windows-x86_64", Path(tmp))

    def test_unsafe_paths_and_unexpected_files(self):
        for name in ["../aether.exe", "/aether.exe", "C:/aether.exe", "pt\\lyrebird.exe", "evil/aether.exe", "aether.toml", "./aether.exe", "PT/lyrebird.exe"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                fetch.extract_payload(archive([(name, pe())]), "windows-x86_64", Path(tmp))

    def test_duplicate_and_conflicting_paths(self):
        for entries in [[("aether.exe", pe()), ("aether.exe", pe())], [("pt", b"bad")], [("aether.exe/", b"")]]:
            with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                fetch.extract_payload(archive(entries), "windows-x86_64", Path(tmp))

    def test_zip_symlink(self):
        entry = zipfile.ZipInfo("aether.exe")
        entry.create_system = 3
        entry.external_attr = 0o120777 << 16
        with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
            fetch.extract_payload(archive([(entry, b"target")]), "windows-x86_64", Path(tmp))

    def test_tar_links_rejected(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
            out = io.BytesIO()
            with tarfile.open(fileobj=out, mode="w:gz") as tar:
                member = tarfile.TarInfo("aether")
                member.type, member.linkname = kind, "../target"
                tar.addfile(member)
            with tempfile.TemporaryDirectory() as tmp, self.assertRaises(ValueError):
                fetch.extract_payload(out.getvalue(), "linux-x86_64", Path(tmp))

    def test_architecture_mismatch(self):
        with self.assertRaises(ValueError):
            fetch.check_architecture(pe(), "linux-x86_64")

    def test_failed_activation_rolls_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dest, stage = root / "engine", root / "stage"
            dest.mkdir()
            stage.mkdir()
            (dest / "aether.exe").write_bytes(b"old engine")
            original = Path.rename

            def fail_stage(path, target):
                if path == stage:
                    raise OSError("simulated activation failure")
                return original(path, target)

            with mock.patch.object(Path, "rename", fail_stage), self.assertRaises(OSError):
                fetch.activate(stage, dest)
            self.assertEqual((dest / "aether.exe").read_bytes(), b"old engine")

    def test_success_preserves_previous_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dest, stage = root / "engine", root / "stage"
            dest.mkdir()
            stage.mkdir()
            (dest / "aether.exe").write_bytes(b"old")
            (stage / "aether.exe").write_bytes(b"new")
            fetch.activate(stage, dest)
            self.assertEqual((dest / "aether.exe").read_bytes(), b"new")
            self.assertEqual(next(root.glob(".engine-backup-*/aether.exe")).read_bytes(), b"old")


if __name__ == "__main__":
    unittest.main()
