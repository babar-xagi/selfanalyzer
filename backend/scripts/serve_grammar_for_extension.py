"""Run the installed grammar model while its Chrome native host remains alive."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import threading
import time

from serve_for_extension import host_is_alive


BACKEND = Path(__file__).resolve().parents[1]


def stop_child(child: subprocess.Popen) -> None:
    if child.poll() is not None:
        return
    child.terminate()
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        child.kill()


def stop_when_host_exits(owner: int, child: subprocess.Popen) -> None:
    while child.poll() is None and host_is_alive(owner):
        time.sleep(1)
    stop_child(child)


def stop_when_pipe_closes(child: subprocess.Popen) -> None:
    sys.stdin.buffer.read()
    stop_child(child)


if __name__ == "__main__":
    server = BACKEND / "data" / "grammar" / "runtime" / "llama-server.exe"
    model = BACKEND / "data" / "grammar" / "model" / "qwen2.5-3b-instruct-q4_k_m.gguf"
    port = os.environ.get("CONVERSATION_COACH_GRAMMAR_PORT", "8081")
    owner = int(os.environ["CONVERSATION_COACH_OWNER_PID"])
    child = subprocess.Popen(
        [str(server), "--model", str(model), "--alias", "grammar-coach", "--host", "127.0.0.1",
         "--port", port, "--ctx-size", "4096", "--threads", "4", "--parallel", "1", "--no-ui"],
        cwd=BACKEND,
    )
    threading.Thread(target=stop_when_host_exits, args=(owner, child), daemon=True).start()
    threading.Thread(target=stop_when_pipe_closes, args=(child,), daemon=True).start()
    raise SystemExit(child.wait())
