#!/usr/bin/env bash
set -euo pipefail

OUT=/home/usr/omnisight/verification_status.txt
: > "$OUT"

docker exec osc_site sh -lc '
  set -eu
  OTP=$(python3 - <<'"'"'PY'"'"'
import base64, hashlib, hmac, struct, time
secret = 'YUQTFPWBKQTSO3GA57CUK47VK5YGDBAB'
key = base64.b32decode(secret + '=' * ((8 - len(secret) % 8) % 8), casefold=True)
step = int(time.time() // 30)
msg = struct.pack('>Q', step)
h = hmac.new(key, msg, hashlib.sha1).digest()
o = h[19] & 15
code = ((h[o] & 127) << 24) | ((h[o+1] & 255) << 16) | ((h[o+2] & 255) << 8) | (h[o+3] & 255)
print(f'{code % 1000000:06d}')
PY
)
  echo "OTP=$OTP"

  curl -sS -D /tmp/login_headers.txt -o /tmp/login_body.txt \
    -H "Origin: http://localhost:3000" \
    -H "Referer: http://localhost:3000/" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{"username":"superadmin","password":"change_me_on_first_login"}' \
    http://localhost:3000/api/proxy/v1/auth/login

  echo "--- login headers ---"
  cat /tmp/login_headers.txt
  echo "--- login body ---"
  cat /tmp/login_body.txt

  CHALLENGE=$(grep -o "osc_mfa_challenge=[^;]*" /tmp/login_headers.txt | head -n1 | cut -d= -f2- || true)
  echo "CHALLENGE=$CHALLENGE"
  if [ -z "$CHALLENGE" ]; then
    echo "FAILED: missing challenge cookie" >&2
    exit 1
  fi

  curl -sS -D /tmp/verify_headers.txt -o /tmp/verify_body.txt \
    -H "Origin: http://localhost:3000" \
    -H "Referer: http://localhost:3000/" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -H "Cookie: osc_mfa_challenge=$CHALLENGE" \
    -d "{\"otp\":\"$OTP\"}" \
    http://localhost:3000/api/proxy/v1/auth/mfa/verify

  echo "--- verify headers ---"
  cat /tmp/verify_headers.txt
  echo "--- verify body ---"
  cat /tmp/verify_body.txt

  SESSION=$(grep -o "osc_session=[^;]*" /tmp/verify_headers.txt | head -n1 | cut -d= -f2- || true)
  echo "SESSION=$SESSION"
  if [ -z "$SESSION" ]; then
    echo "FAILED: missing session cookie" >&2
    exit 1
  fi

  TOKEN=$(curl -sS -H "Content-Type: application/json" -H "Accept: application/json" -H "Authorization: Bearer $SESSION" -d '{"node_type":"HOST","ttl_hours":24}' http://osc_rest:8000/api/v1/agents/enrollment-tokens)
  echo "--- token body ---"
  echo "$TOKEN"

  JSON_TOKEN=$(printf "%s" "$TOKEN" | python3 -c 'import sys, json; print(json.load(sys.stdin)["data"]["token"])' 2>/dev/null || true)
  echo "TOKEN=$JSON_TOKEN"
  if [ -z "$JSON_TOKEN" ]; then
    echo "FAILED: token generation returned no token" >&2
    exit 1
  fi

  ENROLL=$(curl -sS -D /tmp/enroll_headers.txt -o /tmp/enroll_body.txt -H "Content-Type: application/json" -H "Accept: application/json" -d "{\"enrollment_token\":\"$JSON_TOKEN\",\"hostname\":\"omnisight-agent-01\",\"mgmt_ip\":\"10.10.0.10\",\"asset_model_id\":\"d73d224b-4ccd-42a6-89c2-87d9d1ee4687\",\"status_label_id\":\"ab0c96ba-ea5d-4e9f-ac7a-438c84388019\",\"asset_tag\":\"AG-TEST-001\",\"agent_version\":\"v0.1.0\"}" http://osc_rest:8000/api/v1/agents/enroll)
  echo "--- enroll headers ---"
  cat /tmp/enroll_headers.txt
  echo "--- enroll body ---"
  cat /tmp/enroll_body.txt
  echo "$ENROLL"
' > "$OUT" 2>&1
