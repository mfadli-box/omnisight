"""Fixture integrasi CM02 pada database uji terisolasi."""
import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from cm01_support import CM01Case


class CM02Case(CM01Case):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.other_company, cls.other_area, cls.ungranted_area = (uuid.uuid4() for _ in range(3))
        cls.addClassCleanup(cls.cleanup_cm02)
        with cls.db.cursor() as cur:
            cur.execute("INSERT INTO dat_company(company_id,company_code,company_name) VALUES (%s,%s,'QA other')", (cls.other_company, uuid.uuid4().hex[:20]))
            cur.execute("INSERT INTO dat_area(area_id,company_id,area_code,area_name) VALUES (%s,%s,'QA','QA other'),(%s,%s,'QA2','QA ungranted')", (cls.other_area, cls.other_company, cls.ungranted_area, cls.company))
            cur.execute("INSERT INTO dat_menu(group_code,sub_module_code,menu_name,route_path) VALUES ('CM','CM02','CM02','/') ON CONFLICT (sub_module_code) DO NOTHING")
            cur.execute("INSERT INTO dat_permission(role_id,menu_id,can_read) SELECT %s,menu_id,true FROM dat_menu WHERE sub_module_code='CM02'", (cls.role,))
            cur.execute("INSERT INTO trx_user_area(user_id,company_id,area_id) VALUES (%s,%s,%s)", (cls.user, cls.company, cls.area))

    @classmethod
    def cleanup_cm02(cls):
        with cls.db.cursor() as cur:
            cur.execute('DELETE FROM dat_area WHERE area_id IN (%s,%s)', (cls.other_area, cls.ungranted_area))
            cur.execute('DELETE FROM dat_company WHERE company_id=%s', (cls.other_company,))

    def token(self, permissions=True):
        def encode(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
        flags = dict(can_create=False, can_read=permissions, can_update=False, can_delete=False, can_execute=False)
        header = encode({'alg': 'HS256', 'typ': 'JWT'})
        payload = encode(dict(user_id=str(self.user), company_id=str(self.company), role_id=str(self.role), exp=int(time.time()) + 300, permissions={'CM02': flags}))
        message = header + b'.' + payload
        signature = base64.urlsafe_b64encode(hmac.new(self.jwt_key, message, hashlib.sha256).digest()).rstrip(b'=')
        return (message + b'.' + signature).decode()

    def context(self, pairs=(), permissions=True):
        url = 'http://127.0.0.1:8080/baas/v1/tenant/context'
        if pairs:
            url += '?' + urllib.parse.urlencode(pairs)
        request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + self.token(permissions)})
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as exc:
            return exc.code, None
