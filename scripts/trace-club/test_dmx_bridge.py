"""Hardware-free regression tests: python3 -m unittest discover -s scripts/trace-club."""

import io
import json
import unittest
from types import SimpleNamespace

from dmx_bridge import (
    BLACKOUT,
    HOST,
    ORIGIN,
    WATCHDOG_SECONDS,
    BridgeHandler,
    DmxEngine,
    dmx_packet,
    normalize_channels,
    packet,
)


class FakeDevice:
    def __init__(self):
        self.frames = []
        self.closed = False

    def write(self, data):
        if self.closed:
            raise OSError("Device closed")
        self.frames.append(data)

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, request):
        self.request = io.BytesIO(request)
        self.response = bytearray()

    def makefile(self, *_args):
        return self.request

    def sendall(self, data):
        self.response.extend(data)

    def settimeout(self, _timeout):
        pass


class BridgeTest(unittest.TestCase):
    def setUp(self):
        self.now = 10.0
        self.device = FakeDevice()
        self.engine = DmxEngine(self.device, clock=lambda: self.now)
        self.server = SimpleNamespace(engine=self.engine, parameters={"firmware": "2.4", "fps": 40})

    def request(self, path, body="{}", *, method="POST", headers=None):
        if headers is None:
            headers = [("Host", HOST), ("Origin", ORIGIN), ("Content-Type", "application/json")]
        raw = body.encode()
        lines = [f"{method} {path} HTTP/1.1", *[f"{key}: {value}" for key, value in headers]]
        if not any(key.lower() == "content-length" for key, _value in headers):
            lines.append(f"Content-Length: {len(raw)}")
        connection = FakeConnection(("\r\n".join(lines) + "\r\n\r\n").encode() + raw)
        BridgeHandler(connection, ("127.0.0.1", 40000), self.server)
        head, content = bytes(connection.response).split(b"\r\n\r\n", 1)
        return int(head.split(b" ")[1]), head.decode(), json.loads(content)

    def test_full_universe_frame_and_parameter_request(self):
        data = dmx_packet((1, 2, 3, 4, 5, 6))
        self.assertEqual(data[:11], bytes((0x7E, 6, 1, 2, 0, 1, 2, 3, 4, 5, 6)))
        self.assertEqual(data[11:-1], bytes(506))
        self.assertEqual(len(data), 518)
        self.assertEqual(data[-1], 0xE7)
        self.assertEqual(packet(3, b"\0\0"), bytes((0x7E, 3, 2, 0, 0, 0, 0xE7)))

    def test_channel_validation_and_clamping(self):
        self.assertEqual(normalize_channels([-9, 0, 0.49, 0.5, 254.5, 300]), (0, 0, 0, 1, 255, 255))
        for channels in ([1] * 5, [1] * 7, [True] * 6, [None] * 6, ["1"] * 6, [float("nan")] * 6, [float("inf")] * 6):
            with self.subTest(channels=channels), self.assertRaises(ValueError):
                normalize_channels(channels)

    def test_watchdog_blackouts_and_continues_refreshing(self):
        session = self.engine.connect()
        self.engine.update({"session": session, "sequence": 1, "channels": [100] * 6})
        self.now += WATCHDOG_SECONDS - 0.001
        self.engine.tick()
        self.assertEqual(self.device.frames[-1], dmx_packet((100,) * 6))
        self.now += 0.002
        self.engine.tick()
        self.assertEqual(self.device.frames[-1], dmx_packet(BLACKOUT))
        count = len(self.device.frames)
        self.engine.tick()
        self.assertEqual(len(self.device.frames), count + 1)

    def test_late_frames_cannot_undo_stop_or_reset_watchdog(self):
        session = self.engine.connect()
        self.engine.update({"session": session, "sequence": 3}, blackout=True)
        self.engine.update({"session": session, "sequence": 2, "channels": [255] * 6})
        self.engine.tick()
        self.assertEqual(self.device.frames[-1], dmx_packet(BLACKOUT))
        self.engine.update({"session": session, "sequence": 4, "channels": [50] * 6})
        self.now += WATCHDOG_SECONDS
        self.engine.update({"session": session, "sequence": 4, "channels": [255] * 6})
        self.engine.tick()
        self.assertEqual(self.device.frames[-1], dmx_packet(BLACKOUT))

    def test_new_session_blackouts_and_invalidates_previous_tab(self):
        old = self.engine.connect()
        self.engine.update({"session": old, "sequence": 1, "channels": [255] * 6})
        new = self.engine.connect()
        self.assertNotEqual(old, new)
        self.assertEqual(self.device.frames[-1], dmx_packet(BLACKOUT))
        with self.assertRaises(ValueError):
            self.engine.update({"session": old, "sequence": 999, "channels": [255] * 6})

    def test_close_sends_blackout_and_refuses_new_sessions(self):
        self.engine.connect()
        self.engine.close()
        self.assertEqual(self.device.frames[-1], dmx_packet(BLACKOUT))
        self.assertTrue(self.device.closed)
        with self.assertRaises(OSError):
            self.engine.connect()

    def test_http_connect_frame_blackout(self):
        status, headers, response = self.request("/connect")
        self.assertEqual(status, 200)
        self.assertIn(f"Access-Control-Allow-Origin: {ORIGIN}", headers)
        session = response["session"]
        status, _, _ = self.request("/frame", json.dumps({"session": session, "sequence": 1, "channels": [1, 2, 3, 4, 5, 6]}))
        self.assertEqual(status, 200)
        self.engine.tick()
        self.assertEqual(self.device.frames[-1], dmx_packet((1, 2, 3, 4, 5, 6)))
        status, _, _ = self.request("/blackout", json.dumps({"session": session, "sequence": 2}))
        self.assertEqual(status, 200)
        self.assertEqual(self.device.frames[-1], dmx_packet(BLACKOUT))

    def test_http_rejects_untrusted_missing_and_duplicate_origins(self):
        variants = [
            [("Host", HOST)],
            [("Host", HOST), ("Origin", "https://evil.example")],
            [("Host", "evil.example:9097"), ("Origin", ORIGIN)],
            [("Host", HOST), ("Origin", ORIGIN), ("Origin", ORIGIN)],
            [("Host", HOST), ("Host", HOST), ("Origin", ORIGIN)],
        ]
        for headers in variants:
            for method in ("GET", "POST", "OPTIONS"):
                with self.subTest(headers=headers, method=method):
                    status, response_headers, _ = self.request("/connect", headers=headers, method=method)
                    self.assertEqual(status, 403)
                    self.assertNotIn("Access-Control-Allow-Origin:", response_headers)
        self.assertEqual(self.device.frames, [])

    def test_http_rejects_malformed_shape_and_sequence(self):
        session = self.engine.connect()
        for data in ([], None, {"session": session, "sequence": True, "channels": [0] * 6}, {"session": session, "sequence": -1, "channels": [0] * 6}, {"session": session, "sequence": 2 ** 53, "channels": [0] * 6}, {"session": session, "sequence": 1.0, "channels": [0] * 6}, {"session": session, "sequence": 1, "channels": [0] * 6, "extra": 1}):
            with self.subTest(data=data):
                self.assertEqual(self.request("/frame", json.dumps(data))[0], 400)

    def test_http_rejects_duplicate_json_fields(self):
        session = self.engine.connect()
        raw = json.dumps({"session": session, "sequence": 1, "channels": [100] * 6})[:-1] + ', "sequence": 2}'
        self.assertEqual(self.request("/frame", raw)[0], 400)

    def test_http_rejects_ambiguous_headers_and_oversized_body(self):
        base = [("Host", HOST), ("Origin", ORIGIN), ("Content-Type", "application/json")]
        for extra in ([("Content-Length", "2"), ("Content-Length", "2")], [("Transfer-Encoding", "chunked")]):
            with self.subTest(extra=extra):
                self.assertEqual(self.request("/connect", headers=base + extra)[0], 400)
        self.assertEqual(self.request("/connect", headers=base + [("Content-Type", "text/plain")])[0], 415)
        self.assertEqual(self.request("/connect", " " * 513)[0], 413)


if __name__ == "__main__":
    unittest.main()
