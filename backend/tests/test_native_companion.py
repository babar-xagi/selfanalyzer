"""Windows integration check for the Chrome native host and owned API lifecycle."""

import json
import os
from pathlib import Path
import socket
import struct
import subprocess
import time
from urllib.request import urlopen

import pytest


ROOT = Path(__file__).resolve().parents[1]
HOST = ROOT / "native" / "bin" / "ConversationCoachHost.exe"
PORT = 18003
GRAMMAR_PORT = 18004


def online() -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{PORT}/health", timeout=0.5) as response:
            return response.status == 200 and json.load(response).get("status") == "ok"
    except (OSError, ValueError):
        return False


def grammar_online() -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{GRAMMAR_PORT}/health", timeout=0.5) as response:
            return response.status == 200
    except OSError:
        return False


def send(process: subprocess.Popen, message: dict) -> dict:
    payload = json.dumps(message).encode()
    process.stdin.write(struct.pack("=I", len(payload)) + payload)
    process.stdin.flush()
    header = process.stdout.read(4)
    assert len(header) == 4, "Native host closed before replying"
    length = struct.unpack("=I", header)[0]
    return json.loads(process.stdout.read(length))


def test_native_host_starts_and_stops_its_api():
    assert HOST.exists(), "Compile the native host before this test"
    with socket.socket() as check:
        check.bind(("127.0.0.1", PORT))
    environment = {**os.environ, "CONVERSATION_COACH_API_PORT": str(PORT)}
    process = subprocess.Popen([str(HOST)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=ROOT, env=environment)
    try:
        reply = send(process, {"type": "start"})
        assert reply["ok"] and reply["status"] == "ready", reply
        assert online()
        process.stdin.close()  # Chrome closes this pipe when the extension port disconnects.
        process.wait(timeout=10)
        for _ in range(30):
            if not online():
                break
            time.sleep(0.2)
        assert not online(), "API stayed online after native port closure"
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdout.close()


@pytest.mark.skipif(os.environ.get("CONVERSATION_COACH_TEST_GRAMMAR") != "1", reason="Opt-in model integration test")
def test_native_host_starts_and_stops_grammar_model():
    assert HOST.exists(), "Compile the native host before this test"
    with socket.socket() as check:
        check.bind(("127.0.0.1", GRAMMAR_PORT))
    environment = {**os.environ, "CONVERSATION_COACH_GRAMMAR_PORT": str(GRAMMAR_PORT)}
    process = subprocess.Popen([str(HOST)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd=ROOT, env=environment)
    try:
        reply = send(process, {"type": "grammar"})
        assert reply["ok"] and reply["status"] == "grammar-ready", reply
        assert grammar_online()
        process.stdin.close()
        process.wait(timeout=10)
        for _ in range(30):
            if not grammar_online():
                break
            time.sleep(0.2)
        assert not grammar_online(), "Grammar model stayed online after native port closure"
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdout.close()
