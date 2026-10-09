"""Serve the API only while its Chrome native messaging host exists."""

from __future__ import annotations

import ctypes
import os
import threading
import time

import uvicorn


def host_is_alive(pid: int) -> bool:
    kernel = ctypes.windll.kernel32
    kernel.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
    kernel.WaitForSingleObject.restype = ctypes.c_uint32
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.CloseHandle.restype = ctypes.c_int
    handle = kernel.OpenProcess(0x00100000, False, pid)  # PROCESS_SYNCHRONIZE
    if not handle:
        return False
    try:
        return kernel.WaitForSingleObject(handle, 0) == 0x00000102  # WAIT_TIMEOUT
    finally:
        kernel.CloseHandle(handle)


def stop_when_host_exits(pid: int) -> None:
    while host_is_alive(pid):
        time.sleep(1)
    os._exit(0)


if __name__ == "__main__":
    owner = int(os.environ["CONVERSATION_COACH_OWNER_PID"])
    port = int(os.environ.get("CONVERSATION_COACH_API_PORT", "8000"))
    threading.Thread(target=stop_when_host_exits, args=(owner,), daemon=True).start()
    uvicorn.run("app.main:app", host="127.0.0.1", port=port)
