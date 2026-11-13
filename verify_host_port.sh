#!/usr/bin/env bash
set -euo pipefail
OUT=/home/usr/omnisight/verification_status.txt
: > "$OUT"

OTP=$(python3 - <<'PY'
import base64, hashlib, hmac, struct, time
secret = 'YUQTFPWBKQTSO3GA57CUK47VK5YGDBAB'
key = base64.b32decode(secret + '=' * ((8 - len(secret) % 8) % 8), casefold=True)
step = int(time.time() // 30)
msg = struct.pack('>Q', step)
h = hmac.new(key, msg, hashlib.sha1).digest()
o = h[19] & 15
code = ((h[o] & 127) << 24) | ((h[o + 1] & 255) << 16) | ((h[o + 2] & 255) << 8) | (h[o + 3] & 255)
print(f'{code % 1000000:06d}')
PY
)

printf 'OTP=%s\n' "$OTP" >> "$OUT"

curl -sS -D "$OUT.login_headers" -o "$OUT.login_body" \
  -H 'Origin: http://localhost:36663' \
  -H 'Referer: http://localhost:36663/' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"username":"superadmin","password":"change_me_on_first_login"}' \
  http://localhost:36663/api/proxy/v1/auth/login

printf '\n--- login headers ---\n' >> "$OUT"
cat "$OUT.login_headers" >> "$OUT"
printf '\n--- login body ---\n' >> "$OUT"
cat "$OUT.login_body" >> "$OUT"

CHALLENGE=$(grep -o 'osc_mfa_challenge=[^;]*' "$OUT.login_headers" | head -n1 | cut -d= -f2- || true)
printf 'CHALLENGE=%s\n' "$CHALLENGE" >> "$OUT"
if [ -z "$CHALLENGE" ]; then
  echo 'FAILED: missing challenge cookie' >> "$OUT"
  exit 1
fi

curl -sS -D "$OUT.verify_headers" -o "$OUT.verify_body" \
  -H 'Origin: http://localhost:36663' \
  -H 'Referer: http://localhost:36663/' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H "Cookie: osc_mfa_challenge=$CHALLENGE" \
  -d "{\"otp\":\"$OTP\"}" \
  http://localhost:36663/api/proxy/v1/auth/mfa/verify

printf '\n--- verify headers ---\n' >> "$OUT"
cat "$OUT.verify_headers" >> "$OUT"
printf '\n--- verify body ---\n' >> "$OUT"
cat "$OUT.verify_body" >> "$OUT"

SESSION=$(grep -o 'osc_session=[^;]*' "$OUT.verify_headers" | head -n1 | cut -d= -f2- || true)
printf 'SESSION=%s\n' "$SESSION" >> "$OUT"
if [ -z "$SESSION" ]; then
  echo 'FAILED: missing session cookie' >> "$OUT"
  exit 1
fi

curl -sS -D "$OUT.token_headers" -o /tmp/omnisight_token_body.json \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H "Authorization: Bearer $SESSION" \
  -d '{"node_type":"HOST","ttl_hours":24}' \
  http://localhost:8000/api/v1/agents/enrollment-tokens

printf '\n--- token headers ---\n' >> "$OUT"
cat "$OUT.token_headers" >> "$OUT"
printf '\n--- token body ---\n' >> "$OUT"
cat /tmp/omnisight_token_body.json >> "$OUT"

TOKEN=$(python3 -c 'import json; print(json.load(open("/tmp/omnisight_token_body.json"))["data"]["token"])' 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  printf 'TOKEN=%s\n' "$TOKEN" >> "$OUT"
fi

curl -sS -D "$OUT.enroll_headers" -o "$OUT.enroll_body" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d "{\"enrollment_token\":\"$TOKEN\",\"hostname\":\"omnisight-agent-01\",\"mgmt_ip\":\"10.10.0.10\",\"asset_model_id\":\"d73d224b-4ccd-42a6-89c2-87d9d1ee4687\",\"status_label_id\":\"ab0c96ba-ea5d-4e9f-ac7a-438c84388019\",\"asset_tag\":\"AG-TEST-001\",\"agent_version\":\"v0.1.0\"}" \
  http://localhost:8000/api/v1/agents/enroll

printf '\n--- enroll headers ---\n' >> "$OUT"
cat "$OUT.enroll_headers" >> "$OUT"
printf '\n--- enroll body ---\n' >> "$OUT"
cat "$OUT.enroll_body" >> "$OUT"

printf '\nEXIT=0\n' >> "$OUT"
