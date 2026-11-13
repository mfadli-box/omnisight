import base64, hashlib, hmac, json, struct, time, urllib.request

SECRET = 'YUQTFPWBKQTSO3GA57CUK47VK5YGDBAB'


def totp(secret: str):
    key = base64.b32decode(secret + '=' * ((8 - len(secret) % 8) % 8), casefold=True)
    step = int(time.time() // 30)
    msg = struct.pack('>Q', step)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[19] & 15
    code = ((h[offset] & 127) << 24) | ((h[offset + 1] & 255) << 16) | ((h[offset + 2] & 255) << 8) | (h[offset + 3] & 255)
    return f'{code % 1000000:06d}'


def request(url, method='GET', data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        print(f'URL={url}')
        print(f'STATUS={resp.status}')
        for k, v in resp.headers.items():
            if k.lower() in {'set-cookie', 'content-type', 'x-correlation-id'} or 'cookie' in k.lower():
                print(f'{k}: {v}')
        print(body)
        return resp.status, resp.headers, body

OTP = totp(SECRET)
print(f'OTP={OTP}')

status, headers, body = request(
    'http://localhost:3000/api/proxy/v1/auth/login',
    method='POST',
    data=json.dumps({'username': 'superadmin', 'password': 'change_me_on_first_login'}).encode(),
    headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'http://localhost:3000',
        'Referer': 'http://localhost:3000/'
    }
)
challenge = next((c.split(';', 1)[0].split('=', 1)[1] for c in headers.get_all('Set-Cookie', []) if 'osc_mfa_challenge=' in c), None)
if not challenge:
    raise SystemExit('missing challenge cookie')

status, headers, body = request(
    'http://localhost:3000/api/proxy/v1/auth/mfa/verify',
    method='POST',
    data=json.dumps({'otp': OTP}).encode(),
    headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'http://localhost:3000',
        'Referer': 'http://localhost:3000/',
        'Cookie': f'osc_mfa_challenge={challenge}'
    }
)
session = next((c.split(';', 1)[0].split('=', 1)[1] for c in headers.get_all('Set-Cookie', []) if 'osc_session=' in c), None)
if not session:
    raise SystemExit('missing session cookie')

status, headers, token_body = request(
    'http://osc_rest:8000/api/v1/agents/enrollment-tokens',
    method='POST',
    data=json.dumps({'node_type': 'HOST', 'ttl_hours': 24}).encode(),
    headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': f'Bearer {session}'
    }
)
json_token = json.loads(token_body)['data']['token']
print(f'TOKEN={json_token}')

status, headers, enroll_body = request(
    'http://osc_rest:8000/api/v1/agents/enroll',
    method='POST',
    data=json.dumps({
        'enrollment_token': json_token,
        'hostname': 'omnisight-agent-01',
        'mgmt_ip': '10.10.0.10',
        'asset_model_id': 'd73d224b-4ccd-42a6-89c2-87d9d1ee4687',
        'status_label_id': 'ab0c96ba-ea5d-4e9f-ac7a-438c84388019',
        'asset_tag': 'AG-TEST-001',
        'agent_version': 'v0.1.0'
    }).encode(),
    headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
)
print('FINAL_ENROLL_RESULT_OK')
