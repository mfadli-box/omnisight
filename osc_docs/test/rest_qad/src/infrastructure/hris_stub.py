"""Stub HRIS ASMX in-process — simulasi upstream login perusahaan.

Mengemulasi kontrak endpoint ASMX yang dipakai `HrisClient` osc_rest
(api-w1 §1, §5):
- mode ``ok``      → body ``1|<profil>`` (login sukses → sync + cache);
- mode ``invalid`` → body ``0|...|NONE`` (ditolak, TANPA fallback);
- mode ``nonxml``  → body HTML (bukan XML → parser gagal);
- mode ``slow``    → tidak merespons melebihi total timeout (8 s).

Server threaded 127.0.0.1 (anti-SSRF: private range) pada port acak atau
port tetap dari environment (company.hris_login_url harus menunjuk sini).
"""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from domain.models_w1 import HrisStubMode

DEFAULT_STUB_PORT = 18901  # set QA_W1_HRIS_STUB_PORT untuk override


class _StubState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.mode = HrisStubMode.OK
        self.hits = 0

    def next_hit(self) -> tuple[HrisStubMode, int]:
        with self._lock:
            self.hits += 1
            return self.mode, self.hits

    def set_mode(self, mode: HrisStubMode) -> None:
        with self._lock:
            self.mode = mode


class HrisAsmxStub:
    """Server stub HRIS dengan kontrol mode thread-safe + hit counter."""

    def __init__(self, port: int = DEFAULT_STUB_PORT, slow_seconds: int = 12) -> None:
        self._state = _StubState()
        self._slow_seconds = slow_seconds

        stub = self

        class _Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802  (API http.server)
                mode, _ = stub._state.next_hit()
                if mode is HrisStubMode.SLOW:
                    # Melebihi total timeout upstream (8 s) — koneksi ditutup
                    # upstream lebih dulu; body tidak pernah terkirim.
                    import time

                    time.sleep(stub._slow_seconds)
                    return
                if mode is HrisStubMode.OK:
                    body = b"1|budi.santoso|budi.santoso@corp.example|Budi Santoso|ACTIVE|IT"
                    status = 200
                elif mode is HrisStubMode.INVALID:
                    body = b"0|budi.santoso|NONE"
                    status = 200
                else:  # NON_XML
                    body = b"<html><body>Maintenance</body></html>"
                    status = 200
                self.send_response(status)
                self.send_header("Content-Type", "text/xml; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args: object) -> None:  # senyap (evidence via counter)
                return

        self._server = ThreadingHTTPServer(("127.0.0.1", port), _Handler)
        self._thread = threading.Thread(
            target=self._server.serve_forever, daemon=True, name="hris-asmx-stub"
        )

    @property
    def base_url(self) -> str:
        host, port = self._server.server_address[:2]
        return f"http://{host}:{port}"

    def set_mode(self, mode: HrisStubMode) -> None:
        self._state.set_mode(mode)

    def hit_count(self) -> int:
        with self._state._lock:
            return self._state.hits

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()


def stub_response_body(mode: HrisStubMode) -> bytes:
    """Body kanonik stub per mode (untuk unit test tanpa socket)."""
    return {
        HrisStubMode.OK: b"1|budi.santoso|budi.santoso@corp.example|Budi Santoso|ACTIVE|IT",
        HrisStubMode.INVALID: b"0|budi.santoso|NONE",
        HrisStubMode.NON_XML: b"<html><body>Maintenance</body></html>",
        HrisStubMode.SLOW: b"",
    }[mode]
