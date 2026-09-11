#!/usr/bin/env python3
"""Local ENTTEC USB PRO bridge: python3 scripts/trace-club/dmx_bridge.py.

Only http://localhost:3000 may control it. --probe-only requests device parameters
without sending any DMX output. No external Python packages are required.
"""

import argparse
import fcntl
import json
import math
import os
import secrets
import select
import signal
import subprocess
import sys
import termios
import threading
import time
import tty
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


DEVICE = "/dev/cu.usbserial-EN492597"
ADDRESS = ("127.0.0.1", 9097)
ORIGIN = "http://localhost:3000"
HOST = "127.0.0.1:9097"
BLACKOUT = (0, 0, 0, 0, 0, 0)
WATCHDOG_SECONDS = 0.75
FRAME_SECONDS = 1 / 40
MAX_BODY = 512


def packet(label, payload):
    return bytes((0x7E, label, len(payload) & 0xFF, len(payload) >> 8)) + payload + b"\xe7"


def normalize_channels(value):
    if not isinstance(value, list) or len(value) != 6:
        raise ValueError("Expected six channels: R, G, B, W, A, UV")
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in value):
        raise ValueError("Channels must be finite numbers")
    return tuple(max(0, min(255, math.floor(v + 0.5))) for v in value)


def dmx_packet(channels):
    return packet(6, bytes((0, *channels)) + bytes(506))


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate message field")
        result[key] = value
    return result


class SerialDevice:
    def __init__(self):
        # Check both aliases before opening; never terminate another port owner.
        owners = subprocess.run(
            ["/usr/sbin/lsof", "-t", DEVICE, DEVICE.replace("/cu.", "/tty.")],
            capture_output=True, text=True, timeout=3, check=False,
        )
        if owners.stdout.strip():
            raise OSError("ENTTEC is already open in another process; close that app first")
        if owners.returncode not in (0, 1):
            raise OSError("Could not check whether another process owns the ENTTEC")
        self.fd = os.open(DEVICE, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.ioctl(self.fd, termios.TIOCEXCL)
            tty.setraw(self.fd)
            settings = termios.tcgetattr(self.fd)
            settings[2] |= termios.CLOCAL | termios.CREAD
            settings[4] = settings[5] = termios.B57600
            termios.tcsetattr(self.fd, termios.TCSANOW, settings)
            termios.tcflush(self.fd, termios.TCIFLUSH)
        except BaseException:
            os.close(self.fd)
            raise

    def write(self, data):
        remaining = memoryview(data)
        deadline = time.monotonic() + 0.2
        while remaining:
            if time.monotonic() >= deadline:
                raise OSError("ENTTEC write timed out")
            if not select.select([], [self.fd], [], max(0, deadline - time.monotonic()))[1]:
                raise OSError("ENTTEC write timed out")
            try:
                count = os.write(self.fd, remaining)
            except BlockingIOError:
                continue
            if count == 0:
                raise OSError("ENTTEC disconnected")
            remaining = remaining[count:]

    def probe(self):
        self.write(packet(3, b"\x00\x00"))
        received = bytearray()
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            if not select.select([self.fd], [], [], 0.1)[0]:
                continue
            chunk = os.read(self.fd, 1024)
            if not chunk:
                raise OSError("ENTTEC disconnected during handshake")
            received.extend(chunk)
            while received:
                if received[0] != 0x7E:
                    del received[0]
                    continue
                if len(received) < 4:
                    break
                length = received[2] | (received[3] << 8)
                if length > 600:
                    del received[0]
                    continue
                if len(received) < length + 5:
                    break
                reply = bytes(received[:length + 5])
                del received[:length + 5]
                if reply[1] == 3 and reply[-1] == 0xE7 and length >= 5:
                    return {"firmware": f"{reply[5]}.{reply[4]}", "fps": reply[8]}
        raise OSError("ENTTEC did not answer the parameter handshake")

    def close(self):
        try:
            termios.tcdrain(self.fd)
        finally:
            os.close(self.fd)


class DmxEngine:
    def __init__(self, device, clock=time.monotonic):
        self.device = device
        self.clock = clock
        self.lock = threading.Lock()
        self.channels = BLACKOUT
        self.updated_at = 0
        self.session = None
        self.sequence = -1
        self.error = None

    def connect(self):
        with self.lock:
            if self.error:
                raise OSError(self.error)
            self._blackout()
            self.session = secrets.token_hex(16)
            self.sequence = -1
            return self.session

    def update(self, data, blackout=False):
        expected = {"session", "sequence"} if blackout else {"session", "sequence", "channels"}
        if set(data) != expected:
            raise ValueError("Unexpected message fields")
        sequence = data.get("sequence")
        if type(sequence) is not int or not 0 <= sequence <= 2 ** 53 - 1:
            raise ValueError("Invalid frame sequence")
        channels = BLACKOUT if blackout else normalize_channels(data["channels"])
        with self.lock:
            if self.error:
                raise OSError(self.error)
            if not self.session or data.get("session") != self.session:
                raise ValueError("DMX session expired; connect again")
            if sequence <= self.sequence:
                return
            self.sequence = sequence
            self.channels = channels
            self.updated_at = self.clock()
            if blackout:
                self._blackout()

    def _blackout(self):
        self.channels = BLACKOUT
        self.device.write(dmx_packet(BLACKOUT))

    def tick(self):
        with self.lock:
            if self.clock() - self.updated_at >= WATCHDOG_SECONDS:
                self.channels = BLACKOUT
            self.device.write(dmx_packet(self.channels))

    def close(self):
        with self.lock:
            self.session = None
            self.error = "DMX bridge is closed"
            try:
                self._blackout()
            finally:
                self.device.close()

    def run(self, stop):
        try:
            while not stop.is_set():
                started = self.clock()
                self.tick()
                stop.wait(max(0, FRAME_SECONDS - (self.clock() - started)))
        except OSError:
            with self.lock:
                self.error = "ENTTEC disconnected; reconnect the device and restart the bridge"
                self.session = None
                try:
                    self._blackout()
                except OSError:
                    pass  # A physically disconnected device cannot receive blackout.


class BridgeHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(1)

    def log_message(self, _format, *_args):
        pass

    def trusted(self):
        return self.headers.get_all("Host") == [HOST] and self.headers.get_all("Origin") == [ORIGIN]

    def respond(self, status, body):
        encoded = json.dumps(body, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        if self.trusted():
            self.send_header("Access-Control-Allow-Origin", ORIGIN)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()
        try:
            self.wfile.write(encoded)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self.respond(200 if self.trusted() else 403, {})

    def do_GET(self):
        if not self.trusted():
            self.respond(403, {"error": "Only the local Langfuse app may use this bridge"})
        elif self.path != "/status":
            self.respond(404, {"error": "Unknown endpoint"})
        else:
            self.respond(200, {
                "bridge": "langfuse-trace-club", "ready": self.server.engine.error is None,
                **self.server.parameters,
            })

    def do_POST(self):
        if not self.trusted():
            self.respond(403, {"error": "Only the local Langfuse app may use this bridge"})
            return
        if self.path not in ("/connect", "/frame", "/blackout"):
            self.respond(404, {"error": "Unknown endpoint"})
            return
        if self.headers.get_all("Content-Type") != ["application/json"]:
            self.respond(415, {"error": "Expected application/json"})
            return
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not lengths[0].isdigit():
            self.respond(400, {"error": "Expected one Content-Length"})
            return
        length = int(lengths[0])
        if not 0 < length <= MAX_BODY:
            self.respond(413, {"error": "Message too large"})
            return
        try:
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError("Incomplete message")
            data = json.loads(raw, object_pairs_hook=unique_object)
            if type(data) is not dict:
                raise ValueError("Expected a JSON object")
            if self.path == "/connect":
                if data:
                    raise ValueError("Connect takes an empty object")
                self.respond(200, {"session": self.server.engine.connect()})
            else:
                self.server.engine.update(data, blackout=self.path == "/blackout")
                self.respond(200, {"ok": True})
        except (ValueError, UnicodeError, OverflowError) as error:
            self.respond(400, {"error": str(error)})
        except (OSError, TimeoutError):
            self.respond(503, {"error": "DMX device unavailable; restart the bridge"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe-only", action="store_true")
    args = parser.parse_args()
    device = None
    engine = None
    server = None
    output = None
    stop = threading.Event()
    try:
        # Reserve HTTP before opening hardware, so a second bridge cannot take it.
        if not args.probe_only:
            server = ThreadingHTTPServer(ADDRESS, BridgeHandler)
            server.timeout = 0.1
            server.daemon_threads = True
        device = SerialDevice()
        parameters = device.probe()
        print(f"ENTTEC handshake OK: firmware {parameters['firmware']}, {parameters['fps']} fps", flush=True)
        if args.probe_only:
            return 0
        engine = DmxEngine(device)
        engine.tick()
        server.engine = engine
        server.parameters = parameters
        for name in (signal.SIGINT, signal.SIGTERM):
            signal.signal(name, lambda *_args: stop.set())
        output = threading.Thread(target=engine.run, args=(stop,), daemon=True)
        output.start()
        print(f"DMX bridge ready at http://{HOST}; waiting in blackout for {ORIGIN}", flush=True)
        while not stop.is_set():
            server.handle_request()
        return 0
    except (OSError, subprocess.SubprocessError) as error:
        print(f"DMX bridge: {error}", file=sys.stderr)
        return 1
    finally:
        stop.set()
        if server:
            server.server_close()
        if output:
            output.join(timeout=1)
        if device:
            try:
                engine.close() if engine else device.close()
            except OSError:
                pass


if __name__ == "__main__":
    sys.exit(main())
