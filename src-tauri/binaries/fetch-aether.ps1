# Python 3 is required; CI supplies it with actions/setup-python.
# The shared helper validates SHA256, archive paths and both executable architectures.
$ErrorActionPreference = 'Stop'
python (Join-Path $PSScriptRoot 'fetch-aether.py')
if ($LASTEXITCODE -ne 0) { throw "Aether fetch failed (exit $LASTEXITCODE)" }
