"""Run the knee ROM screen on a session JSON file and print structured JSON.

Usage:
  python analyze_knee_rom.py --input session_input.json [--visibility-min 0.5]
      [--segment-tolerance 0.15] [--measurement-tolerance-deg 5]

Exit codes: 0 success (JSON on stdout); 2 invalid input or failed calculation
(JSON {"error": ...} on stderr). No external dependencies.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from joint_angles import analyze_session  # noqa: E402


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input", required=True, help="path to session JSON")
    p.add_argument("--visibility-min", type=float)
    p.add_argument("--segment-tolerance", type=float)
    p.add_argument("--measurement-tolerance-deg", type=float)
    args = p.parse_args()
    overrides = {k: v for k, v in {
        "visibility_min": args.visibility_min,
        "segment_tolerance": args.segment_tolerance,
        "measurement_tolerance_deg": args.measurement_tolerance_deg,
    }.items() if v is not None}
    try:
        with open(args.input, encoding="utf-8") as fh:
            session = json.load(fh)
        if not isinstance(session, dict):
            raise ValueError("session JSON must be an object.")
        result = analyze_session(session, overrides)
        print(json.dumps(result, indent=2, allow_nan=False))
    except FileNotFoundError:
        print(json.dumps({"error": f"input file not found: {args.input}"}), file=sys.stderr)
        return 2
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"input is not valid JSON: {e}"}), file=sys.stderr)
        return 2
    except (ValueError, OverflowError, ZeroDivisionError) as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
