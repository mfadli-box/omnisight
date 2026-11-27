"""Perlengkapan integrasi CM01; gunakan hanya database uji yang terisolasi."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import socket
import subprocess
import threading
import time
import unittest
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

class MockHRIS(BaseHTTPRequestHandler):
    response = b'<string xmlns="App.Login">1|---|mock</string>'
    status = 200
    hits = 0
    location = None
    def do_GET(self):
        type(self).hits += 1
        self.send_response(type(self).status)
        if type(self).location:
            self.send_header('Location', type(self).location)
        self.end_headers()
        self.wfile.write(type(self).response)
    def log_message(self, *args):
        pass

class CM01Case(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        dsn = os.environ.get('CM01_TEST_DATABASE_URL')
        if not dsn or os.environ.get('CM01_DISPOSABLE_DATABASE') != 'yes':
            raise RuntimeError('Set CM01_TEST_DATABASE_URL dan CM01_DISPOSABLE_DATABASE=yes untuk database uji terisolasi.')
        try:
            import psycopg
            from argon2 import PasswordHasher
        except ImportError as exc:
            raise RuntimeError('Instal psycopg dan argon2-cffi untuk pengujian integrasi.') from exc
        cls.db = psycopg.connect(dsn, autocommit=True)
        cls.hasher = PasswordHasher()
        cls.password = secrets.token_urlsafe(24)
        cls.secret = base64.b32encode(secrets.token_bytes(20)).decode().rstrip('=')
        cls.jwt_key = secrets.token_bytes(32)
        cls.ids = [uuid.uuid4() for _ in range(4)]
        cls.company, cls.area, cls.user, cls.role = cls.ids
        cls.username = 'qa_' + uuid.uuid4().hex
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), MockHRIS)
        cls.addClassCleanup(cls.server.server_close)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.addClassCleanup(cls.server.shutdown)
        cls.url = 'http://127.0.0.1:%d/login' % cls.server.server_port
        cls.addClassCleanup(cls.cleanup_db)
        with cls.db.cursor() as cur:
            cur.execute('INSERT INTO dat_company(company_id,company_code,company_name) VALUES (%s,%s,%s)', (cls.company, cls.username[:20], 'QA'))
            cur.execute('INSERT INTO dat_area(area_id,company_id,area_code,area_name) VALUES (%s,%s,%s,%s)', (cls.area, cls.company, 'QA', 'QA'))
            cur.execute('INSERT INTO dat_user(user_id,username,email,password_hash,mfa_secret) VALUES (%s,%s,%s,%s,%s)', (cls.user, cls.username, cls.username+'@example.invalid', cls.hasher.hash(cls.password), cls.secret))
            cur.execute('INSERT INTO dat_employee(user_id,employee_nik,full_name,home_company_id,home_area_id) VALUES (%s,%s,%s,%s,%s)', (cls.user, cls.username, 'QA', cls.company, cls.area))
            cur.execute('INSERT INTO dat_role(role_id,role_code,role_name) VALUES (%s,%s,%s)', (cls.role, cls.username[:30], 'QA'))
            cur.execute('INSERT INTO trx_user_company(user_id,company_id,role_id) VALUES (%s,%s,%s)', (cls.user, cls.company, cls.role))
        binary = ROOT / 'osc_rest/target/debug/osc-rest'
        if not binary.is_file():
            raise RuntimeError('Jalankan cargo build --manifest-path osc_rest/Cargo.toml terlebih dahulu.')
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', 8080)) == 0:
                raise RuntimeError('Port 8080 sedang digunakan; suite memerlukan port tersebut untuk server uji.')
        env = dict(os.environ, DATABASE_URL=dsn, JWT_SECRET=base64.b64encode(cls.jwt_key).decode(), HRIS_ALLOWED_HOSTS='127.0.0.1')
        cls.process = subprocess.Popen([str(binary)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.addClassCleanup(cls.stop_process)
        for _ in range(100):
            if cls.process.poll() is not None:
                raise RuntimeError('Server uji gagal dimulai.')
            with socket.socket() as probe:
                if probe.connect_ex(('127.0.0.1', 8080)) == 0:
                    break
            time.sleep(.1)
        else:
            raise RuntimeError('Server uji tidak siap.')

    @classmethod
    def stop_process(cls):
        cls.process.terminate()
        try: cls.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.process.kill(); cls.process.wait()

    @classmethod
    def cleanup_db(cls):
        with cls.db.cursor() as cur:
            cur.execute('DELETE FROM log_hris_auth_sync WHERE user_id=%s', (cls.user,))
            cur.execute('DELETE FROM dat_user WHERE user_id=%s', (cls.user,))
            cur.execute('DELETE FROM dat_area WHERE area_id=%s', (cls.area,))
            cur.execute('DELETE FROM dat_company WHERE company_id=%s', (cls.company,))
            cur.execute('DELETE FROM dat_role WHERE role_id=%s', (cls.role,))
        cls.db.close()

    def setUp(self):
        MockHRIS.response = b'<string xmlns="App.Login">1|---|mock</string>'
        MockHRIS.status = 200
        MockHRIS.hits = 0
        MockHRIS.location = None
        with self.db.cursor() as cur:
            cur.execute('UPDATE dat_company SET has_hris_link=false, hris_login_url=NULL, is_mfa_active=false WHERE company_id=%s', (self.company,))
            cur.execute('UPDATE dat_user SET is_mfa_enabled=false, hris_backup_password=NULL WHERE user_id=%s', (self.user,))

    def linked(self, endpoint=None):
        with self.db.cursor() as cur:
            cur.execute('UPDATE dat_company SET has_hris_link=true, hris_login_url=%s WHERE company_id=%s', (endpoint or self.url, self.company))

    def post(self, route, payload):
        request = urllib.request.Request('http://127.0.0.1:8080/api/v1/auth/'+route, data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as exc:
            return exc.code, {}

    def login(self, password=None):
        return self.post('login', {'company_id':str(self.company), 'username':self.username, 'password':self.password if password is None else password})

    def otp(self):
        key = base64.b32decode(self.secret + '=' * (-len(self.secret) % 8))
        digest = hmac.new(key, int(time.time() // 30).to_bytes(8, 'big'), hashlib.sha1).digest()
        offset = digest[-1] & 15
        return '%06d' % ((int.from_bytes(digest[offset:offset+4], 'big') & 0x7fffffff) % 1000000)
