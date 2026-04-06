"""
RNN handwriting inference via subprocess to the TF2 fork.

The nblasgen/handwriting-synthesis-2025 model requires Python 3.11 + TF 2.15.
We isolate it by running a worker script as a subprocess in the fork's directory,
communicating via JSON over stdin/stdout.
"""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import textwrap
from pathlib import Path

logger = logging.getLogger(__name__)

# Absolute path to the TF2 fork repo
_REPO_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "research"
    / "handwriting-synthesis-2025"
)

# Valid characters the RNN model supports (from drawing.py alphabet)
_VALID_CHARS = set(
    '\x00 !"#\'(),-.'
    "0123456789:;?"
    "ABCDEFGHIJKLMNOPRSTUVWY"
    "abcdefghijklmnopqrstuvwxyz"
)

# Uppercase letters missing from the model — map to lowercase
_CASE_MAP = {"Q": "q", "X": "x", "Z": "z"}


def sanitize_text(text: str) -> str:
    """Sanitize text for the RNN model's character set."""
    result = []
    for ch in text:
        if ch in _CASE_MAP:
            result.append(_CASE_MAP[ch])
        elif ch in _VALID_CHARS:
            result.append(ch)
        # else: silently drop unsupported characters
    return "".join(result)


def split_into_lines(text: str, max_chars: int = 75) -> list[str]:
    """Split text into lines of at most max_chars, breaking at word boundaries."""
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    current_len = 0

    for word in words:
        # If single word exceeds limit, truncate it
        if len(word) > max_chars:
            if current:
                lines.append(" ".join(current))
                current = []
                current_len = 0
            lines.append(word[:max_chars])
            continue

        needed = len(word) + (1 if current else 0)
        if current_len + needed > max_chars:
            lines.append(" ".join(current))
            current = [word]
            current_len = len(word)
        else:
            current.append(word)
            current_len += needed

    if current:
        lines.append(" ".join(current))

    return lines if lines else [""]


# The inference worker script that runs inside the TF2 fork's directory.
# It reads JSON requests from stdin and writes JSON responses to stdout.
_WORKER_SCRIPT = textwrap.dedent("""\
    import json
    import sys
    import os
    import numpy as np

    # Ensure we're in the right directory for relative path access
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    from hand import Hand

    # Redirect TF noise to stderr so stdout stays clean for JSON
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

    # Load model once
    hand = Hand()

    # Signal ready
    sys.stdout.write(json.dumps({"status": "ready"}) + "\\n")
    sys.stdout.flush()

    # Process requests
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            text_lines = req["lines"]
            style_index = req.get("style_index")
            bias = req.get("bias", 0.5)

            styles = [style_index] * len(text_lines) if style_index is not None else None
            biases = [bias] * len(text_lines)

            strokes = hand._sample(text_lines, biases=biases, styles=styles)

            result = []
            for s in strokes:
                result.append(s.tolist())

            sys.stdout.write(json.dumps({"status": "ok", "strokes": result}) + "\\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"status": "error", "error": str(e)}) + "\\n")
            sys.stdout.flush()
""")


class RNNInferenceClient:
    """Manages a persistent subprocess running the TF2 RNN model."""

    def __init__(self) -> None:
        self._proc: subprocess.Popen | None = None
        self._worker_path = _REPO_DIR / "_inference_worker.py"

    def _ensure_worker_script(self) -> None:
        """Write the worker script into the TF2 fork directory."""
        if not self._worker_path.exists():
            self._worker_path.write_text(_WORKER_SCRIPT)
            logger.info("Wrote inference worker to %s", self._worker_path)

    def _start_process(self) -> None:
        """Start the inference subprocess."""
        self._ensure_worker_script()

        # Use the system python — the TF2 fork needs its own env
        # Try python3.11 first, fall back to python3, then python
        python_cmd = self._find_python()

        logger.info("Starting RNN inference subprocess: %s %s", python_cmd, self._worker_path)
        self._proc = subprocess.Popen(
            [python_cmd, str(self._worker_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(_REPO_DIR),
            text=True,
            bufsize=1,  # line-buffered
        )

        # Wait for "ready" signal
        ready_line = self._proc.stdout.readline()  # type: ignore[union-attr]
        if not ready_line:
            stderr = self._proc.stderr.read() if self._proc.stderr else ""  # type: ignore[union-attr]
            raise RuntimeError(f"RNN inference subprocess failed to start. stderr: {stderr[:500]}")

        ready = json.loads(ready_line)
        if ready.get("status") != "ready":
            raise RuntimeError(f"RNN inference subprocess sent unexpected ready signal: {ready}")

        logger.info("RNN inference subprocess ready (PID %d)", self._proc.pid)

    def _find_python(self) -> str:
        """Find a working Python interpreter for the TF2 fork."""
        # Check for a venv in the repo dir first
        venv_python = _REPO_DIR / ".venv" / "bin" / "python"
        if venv_python.exists():
            return str(venv_python)

        # Try system pythons
        for cmd in ("python3.11", "python3", "python"):
            try:
                result = subprocess.run(
                    [cmd, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    return cmd
            except (FileNotFoundError, subprocess.TimeoutExpired):
                continue

        raise RuntimeError(
            "No Python interpreter found. Install Python 3.11 or create a venv at "
            f"{_REPO_DIR}/.venv/"
        )

    def _ensure_running(self) -> None:
        """Ensure the subprocess is alive."""
        if self._proc is None or self._proc.poll() is not None:
            self._start_process()

    def generate_strokes(
        self,
        text: str,
        style_index: int | None = None,
        bias: float = 0.5,
    ) -> list[list[list[float]]]:
        """Generate handwriting strokes for the given text.

        Returns a list of stroke arrays, one per line. Each stroke array
        is a list of [dx, dy, eos] triples (raw model offsets).
        """
        # Sanitize and split
        clean = sanitize_text(text)
        if not clean.strip():
            raise ValueError("Text is empty after sanitization")

        lines = split_into_lines(clean)
        logger.info("Generating %d lines: %s", len(lines), [l[:30] for l in lines])

        self._ensure_running()
        assert self._proc is not None and self._proc.stdin is not None

        request = {
            "lines": lines,
            "style_index": style_index,
            "bias": bias,
        }

        # Send request
        self._proc.stdin.write(json.dumps(request) + "\n")
        self._proc.stdin.flush()

        # Read response
        response_line = self._proc.stdout.readline()  # type: ignore[union-attr]
        if not response_line:
            # Process died
            self._proc = None
            raise RuntimeError("RNN inference subprocess died during generation")

        response = json.loads(response_line)
        if response.get("status") == "error":
            raise RuntimeError(f"RNN inference error: {response.get('error')}")

        return response["strokes"]

    def shutdown(self) -> None:
        """Terminate the subprocess."""
        if self._proc is not None:
            self._proc.terminate()
            self._proc.wait(timeout=5)
            self._proc = None
            logger.info("RNN inference subprocess terminated")
