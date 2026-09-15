"""Separate-process fixture verification and hostile-input regression corpus."""
import hashlib
from pathlib import Path
import random
import sys
import tempfile
import unittest

from worker import run_bounded

BINARY = str(Path(sys.argv.pop(1)).resolve())
FIXTURE = Path(__file__).parent / "evidence" / "balance-v1.pqe"


class VerificationProcessTests(unittest.TestCase):
    def verify_file(self, path, fee="1"):
        return run_bounded([BINARY, "verify", str(path), fee])

    def test_golden_verifies_without_prover_or_witness(self):
        self.assertEqual(
            "3ccac57aebe1965271d7b47cf2a5eafd335d3e5b41cc3952899ba928edebb011",
            hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),
        )
        report = self.verify_file(FIXTURE)
        self.assertTrue(report["valid"], report)
        self.assertFalse(report["productionReady"])
        self.assertFalse(self.verify_file(FIXTURE, "2")["valid"])
        self.assertFalse(self.verify_file(FIXTURE, "4294967296")["valid"])
        self.assertFalse(self.verify_file(FIXTURE.with_suffix(".missing"))["valid"])

    def test_hostile_files_reject_in_fresh_processes(self):
        original = FIXTURE.read_bytes()
        cases = [b"", original[:63], original[:-1], original + b"\x00", b"\x00" * 1048641]
        for offset in [0, 8, 12, 16, 20, 60]:
            changed = bytearray(original)
            changed[offset] ^= 1
            cases.append(changed)
        # Corrupt field encodings and internal length indicators, not only header bytes.
        for offset in [64, 72, 80]:
            changed = bytearray(original)
            changed[offset:offset + 8] = (0xFFFFFFFF00000000).to_bytes(8, "little")
            cases.append(changed)
        rng = random.Random(20260913)
        for _ in range(16):
            changed = bytearray(original)
            changed[rng.randrange(64, len(changed))] ^= 1
            cases.append(changed)
        with tempfile.TemporaryDirectory(prefix="jgc-pq-corpus-") as directory:
            path = Path(directory) / "bad.pqe"
            for index, case in enumerate(cases):
                path.write_bytes(case)
                self.assertFalse(self.verify_file(path)["valid"], f"case {index}")

    def test_worker_timeout_and_abnormal_exit_fail_closed(self):
        self.assertEqual("timeout", run_bounded([sys.executable, "-c", "import time; time.sleep(30)"], 0.1)["error"])
        self.assertFalse(run_bounded([sys.executable, "-c", "raise SystemExit(3)"])["valid"])
        self.assertFalse(run_bounded([sys.executable, "-c", "print('{}')"])["valid"])
        # A JSON `valid` flag cannot turn a failed process into acceptance.
        code = "import json; print(json.dumps({'valid':True})); raise SystemExit(1)"
        self.assertFalse(run_bounded([sys.executable, "-c", code])["valid"])


if __name__ == "__main__":
    unittest.main()
