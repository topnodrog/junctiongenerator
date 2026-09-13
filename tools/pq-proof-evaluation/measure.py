"""One fresh-process Linux/macOS measurement; use synthetic harness inputs only."""
import json
import platform
import resource
import subprocess
import sys


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: python3 measure.py /path/to/jgc-pq-proof-evaluation")
    # No shell; no user witness, network operation, or proof persistence.
    result = subprocess.run(
        [sys.argv[1]], capture_output=True, text=True, check=True, timeout=180
    )
    measurement = json.loads(result.stdout)
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    # Linux reports KiB; macOS reports bytes. Never label unknown units as bytes.
    if sys.platform == "linux":
        peak_bytes = usage.ru_maxrss * 1024
    elif sys.platform == "darwin":
        peak_bytes = usage.ru_maxrss
    else:
        raise SystemExit("unsupported maximum-RSS units on this platform")
    measurement["peakMemoryBytes"] = peak_bytes
    measurement["memoryMeasurement"] = "whole-process maximum RSS; prover and verifier combined"
    measurement["kernel"] = platform.release()
    print(json.dumps(measurement))


if __name__ == "__main__":
    main()
