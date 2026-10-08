"""Unit test REST API backend `osc_rest` menggunakan Python (unittest).

Menjalankan pengujian kontrak endpoint terhadap instance yang sedang berjalan.
Default base URL: http://localhost:37772 (bisa di-override via env OSC_BACKEND_URL).

Kredensial login dibaca dari osc_base/.env (AD_MAIL/AD_PASS) dan username "root"
sesuai seed. Jika server tidak dapat dijangkau atau credensial tidak tersedia,
seluruh test di-skip (tidak gagal).
"""

import json
import os
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_URL = os.environ.get("OSC_BACKEND_URL", "http://localhost:37772").rstrip("/")
USERNAME = os.environ.get("OSC_TEST_USER", "root")


def _read_env(files):
    env = {}
    for f in files:
        path = Path(f)
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def _error_unpack(payload):
    """Mengembalikan (code, message, request_id) dari response error backend."""
    return payload.get("code"), payload.get("error"), payload.get("request_id")


class BackendApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            with urllib.request.urlopen(f"{BACKEND_URL}/rest/guest/", timeout=3) as r:
                cls.server_up = r.status == 200
        except Exception:
            cls.server_up = False
        if not cls.server_up:
            raise unittest.SkipTest(f"backend tidak aktif di {BACKEND_URL}")

        cls.env = _read_env([ROOT / "osc_base/.env", ROOT / "osc_rest/.env"])
        cls.password = os.environ.get("OSC_TEST_PASS") or cls.env.get("AD_PASS") or cls.env.get("PG_PASS")
        cls.company_id = os.environ.get("OSC_TEST_COMPANY", "")
        cls.username = os.environ.get("OSC_TEST_USER", USERNAME)
        if not cls.password:
            raise unittest.SkipTest("password login tidak tersedia di env")
        if not cls.company_id:
            try:
                with urllib.request.urlopen(f"{BACKEND_URL}/rest/guest/PUB00", timeout=4) as r:
                    public = json.loads(r.read() or "null")
                companies = public.get("data") or []
                if companies:
                    cls.company_id = companies[0].get("company_id", "")
            except Exception:
                pass
        if not cls.company_id:
            raise unittest.SkipTest("company_id tidak tersedia (set OSC_TEST_COMPANY)")

        cls.token = None

    @classmethod
    def _req(cls, method, path, body=None, token=None, timeout=8):
        url = BACKEND_URL + path
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, json.loads(r.read() or "null"), r.headers
        except urllib.error.HTTPError as e:
            raw = e.read() or b"null"
            return e.code, json.loads(raw), e.headers

    def test_guest_root(self):
        status, body, _ = self._req("GET", "/rest/guest/")
        self.assertEqual(status, 200)
        self.assertIn("message", body)

    def test_guest_pub00_list_company(self):
        status, body, _ = self._req("GET", "/rest/guest/PUB00")
        self.assertEqual(status, 200)
        self.assertIsInstance(body.get("data"), list)

    def test_login_success_shape(self):
        status, body, _ = self._req(
            "POST", "/rest/guest/PUB00",
            {"company_id": self.company_id, "username": USERNAME, "password": self.password},
        )
        self.assertEqual(status, 200, f"login gagal: {body}")
        data = body.get("data", {})
        self.assertTrue(data.get("token"))
        self.assertTrue(data.get("expires_at"))
        self.assertIn("user_profile", data)
        BackendApiTest.token = data["token"]

    def test_login_wrong_password(self):
        status, body, _ = self._req(
            "POST", "/rest/guest/PUB00",
            {"company_id": self.company_id, "username": USERNAME, "password": "wrong-password"},
        )
        self.assertEqual(status, 401)
        code, message, request_id = _error_unpack(body)
        self.assertEqual(code, "UNAUTHORIZED")
        self.assertTrue(message)
        self.assertTrue(request_id)

    def test_profile_requires_auth(self):
        status, body, _ = self._req("GET", "/rest/pages/SYS01/profile")
        self.assertEqual(status, 401)
        code, _, _ = _error_unpack(body)
        self.assertEqual(code, "UNAUTHORIZED")

    def test_profile_with_token(self):
        if not self.token:
            self.skipTest("perlu token dari test_login_success")
        status, body, _ = self._req("GET", "/rest/pages/SYS01/profile", token=self.token)
        self.assertEqual(status, 200)
        profile = body.get("data", {})
        self.assertEqual(profile.get("username"), USERNAME)

    def test_company_requires_auth(self):
        status, _, _ = self._req("GET", "/rest/pages/APP00/company")
        self.assertEqual(status, 401)

    def test_module_list_with_admin_token(self):
        if not self.token:
            self.skipTest("perlu token dari test_login_success")
        status, body, _ = self._req("GET", "/rest/pages/APP01/modules?page=1&page_size=10", token=self.token)
        self.assertEqual(status, 200)
        data = body.get("data", {})
        self.assertIsInstance(data.get("Rows"), list)
        self.assertIsInstance(data.get("Total"), int)
        self.assertEqual(data.get("Page"), 1)
        self.assertEqual(data.get("PageSize"), 10)
        self.assertGreaterEqual(data.get("TotalPage"), 0)

    def test_page_defaults(self):
        status, body, _ = self._req("GET", "/rest/pages/APP01/modules", token=self.token or "")
        if status != 200:
            self.skipTest("butuh token admin")
        data = body.get("data", {})
        self.assertEqual(data.get("Page"), 1)
        self.assertEqual(data.get("PageSize"), 25)


if __name__ == "__main__":
    unittest.main(verbosity=2)