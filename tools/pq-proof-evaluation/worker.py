"""Offline verification worker with a parent deadline. Not a network service."""
import json
import os
import subprocess
import sys
import time

MEMORY_LIMIT = 512 * 1024 * 1024
TIMEOUT_SECONDS = 5


def linux_limits():
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT, MEMORY_LIMIT))
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))


def run_bounded(command, timeout=TIMEOUT_SECONDS):
    env = dict(os.environ, RAYON_NUM_THREADS="2")
    started = time.monotonic()
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout, env=env,
            preexec_fn=linux_limits if sys.platform == "linux" else None,
        )
    except subprocess.TimeoutExpired:
        return {"valid": False, "error": "timeout"}
    except (OSError, UnicodeError, subprocess.SubprocessError):
        return {"valid": False, "error": "worker unavailable"}
    try:
        report = json.loads(result.stdout)
    except (json.JSONDecodeError, UnicodeError):
        return {"valid": False, "error": "invalid worker response"}
    if not isinstance(report, dict) or result.returncode != 0 or report.get("valid") is not True:
        return {"valid": False, "error": "worker rejected"}
    if report.get("mode") != "verify-only" or report.get("productionReady") is not False:
        return {"valid": False, "error": "unexpected worker mode"}
    report["workerWallMs"] = (time.monotonic() - started) * 1000
    report["addressSpaceLimitBytes"] = MEMORY_LIMIT if sys.platform == "linux" else None
    report["deadlineSeconds"] = timeout
    return report


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: python worker.py BINARY PROOF_FILE EXPECTED_FEE")
    report = run_bounded([sys.argv[1], "verify", sys.argv[2], sys.argv[3]])
    print(json.dumps(report))
    raise SystemExit(0 if report["valid"] else 1)
