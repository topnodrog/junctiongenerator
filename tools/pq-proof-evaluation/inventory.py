"""Emit portable dependency metadata/checksums; does not certify licenses or safety."""
import hashlib
import json
from pathlib import Path
import subprocess
import tomllib

root = Path(__file__).resolve().parent
lock_bytes = (root / "Cargo.lock").read_bytes()
lock = tomllib.loads(lock_bytes.decode())
checksums = {(p["name"], p["version"]): p.get("checksum") for p in lock["package"]}
metadata = json.loads(subprocess.run(
    ["cargo", "metadata", "--locked", "--format-version", "1", "--manifest-path", str(root / "Cargo.toml")],
    capture_output=True, text=True, check=True,
).stdout)
packages = []
for package in metadata["packages"]:
    if package["source"] is None:
        continue
    packages.append({
        "name": package["name"], "version": package["version"],
        "licenseDeclared": package["license"],
        "source": package["source"],
        "checksum": checksums[(package["name"], package["version"])],
    })
print(json.dumps({
    "schemaVersion": 1,
    "lockfileSha256": hashlib.sha256(lock_bytes).hexdigest(),
    "scope": "all resolved targets, including build dependencies; not an audited SBOM",
    "packages": sorted(packages, key=lambda p: (p["name"], p["version"])),
}, indent=2))
