import base64
import hashlib
import hmac
import json
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cm01_support import CM01Case, MockHRIS

class Functional(CM01Case):
    def test_local_argon2id(self):
        self.assertEqual(self.login()[0], 200)
        self.assertEqual(self.login('invalid')[0], 401)

    def test_hris_xml(self):
        self.linked()
        MockHRIS.response = b'<string xmlns="App.Login">1|---|a&amp;b</string>'
        self.assertEqual(self.login()[0], 200)

    def test_backup_sync(self):
        self.linked()
        self.assertEqual(self.login()[0], 200)
        with self.db.cursor() as cur:
            cur.execute('SELECT hris_backup_password FROM dat_user WHERE user_id=%s', (self.user,))
            saved = cur.fetchone()[0]
        self.assertTrue(saved.startswith('$argon2id$'))
        self.assertTrue(self.hasher.verify(saved, self.password))

    def test_hris_rejection_does_not_fallback(self):
        self.linked()
        with self.db.cursor() as cur:
            cur.execute('UPDATE dat_user SET hris_backup_password=%s WHERE user_id=%s', (self.hasher.hash(self.password), self.user))
        MockHRIS.response = b'<string xmlns="App.Login">0|---|NONE</string>'
        self.assertEqual(self.login()[0], 401)

    def test_fallback(self):
        self.linked()
        with self.db.cursor() as cur:
            cur.execute('UPDATE dat_user SET hris_backup_password=%s WHERE user_id=%s', (self.hasher.hash(self.password), self.user))
        MockHRIS.status = 500
        status, body = self.login()
        self.assertEqual(status, 200)
        self.assertTrue(body['data']['warning_flag'])
        self.assertEqual(self.login('invalid')[0], 401)

    def test_mfa(self):
        with self.db.cursor() as cur:
            cur.execute('UPDATE dat_user SET is_mfa_enabled=true WHERE user_id=%s', (self.user,))
        status, body = self.login()
        self.assertEqual(status, 200)
        self.assertNotIn('access_token', body['data'])
        token = body['data']['mfa_challenge_token']
        bad = '000000' if self.otp() != '000000' else '999999'
        self.assertEqual(self.post('mfa/verify', {'mfa_challenge_token':token, 'otp':bad})[0], 401)
        self.assertEqual(self.post('mfa/verify', {'mfa_challenge_token':token, 'otp':self.otp()})[0], 200)
        self.assertEqual(self.post('mfa/verify', {'mfa_challenge_token':token, 'otp':self.otp()})[0], 401)

    def test_jwt_signature_and_claims(self):
        status, body = self.login()
        self.assertEqual(status, 200)
        header, payload, signature = body['data']['access_token'].split('.')
        decode = lambda s: base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))
        self.assertEqual(json.loads(decode(header))['alg'], 'HS256')
        self.assertTrue(hmac.compare_digest(decode(signature), hmac.new(self.jwt_key, (header+'.'+payload).encode(), hashlib.sha256).digest()))
        claims = json.loads(decode(payload))
        self.assertEqual(claims['user_id'], str(self.user))
        self.assertEqual(claims['company_id'], str(self.company))
        self.assertGreater(claims['exp'], claims['iat'])

if __name__ == '__main__': unittest.main()
