"""Connectivity test script that prints the current date and time."""

import sys
from datetime import datetime


def main() -> int:
    """Print the current date and time in a human-readable format.

    Returns:
        Exit code: 0 on success, 1 on failure.
    """
    try:
        now = datetime.now()
        formatted = now.strftime("%Y-%m-%d %H:%M:%S")
        print(f"Current date and time: {formatted}")
        return 0
    except OSError as exc:
        print(f"Error: failed to retrieve system time: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Error: unexpected failure: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
