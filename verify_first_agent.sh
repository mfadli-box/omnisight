#!/usr/bin/env bash
set -euo pipefail

OUT=/home/usr/omnisight/verification_status.txt
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

OTP=$(python3 - <<'PY'
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

printf 'OTP=%s\n' "$OTP" > "$OUT"

curl -sS -D "$TMP/login_headers.txt" -o "$TMP/login_body.txt" \
  -H 'Origin: http://localhost:36663' \
  -H 'Referer: http://localhost:36663/' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"username":"superadmin","password":"change_me_on_first_login"}' \
  http://localhost:36663/api/proxy/v1/auth/login

printf '\n--- login headers ---\n' >> "$OUT"
cat "$TMP/login_headers.txt" >> "$OUT"
printf '\n--- login body ---\n' >> "$OUT"
cat "$TMP/login_body.txt" >> "$OUT"

CHALLENGE=$(grep -o 'osc_mfa_challenge=[^;]*' "$TMP/login_headers.txt" | head -n1 | cut -d= -f2- || true)
printf 'CHALLENGE=%s\n' "$CHALLENGE" >> "$OUT"
if [ -z "$CHALLENGE" ]; then
  echo 'FAILED: missing challenge cookie' >> "$OUT"
  exit 1
fi

curl -sS -D "$TMP/verify_headers.txt" -o "$TMP/verify_body.txt" \
  -H 'Origin: http://localhost:36663' \
  -H 'Referer: http://localhost:36663/' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -H "Cookie: osc_mfa_challenge=$CHALLENGE" \
  -d "{\"otp\":\"$OTP\"}" \
  http://localhost:36663/api/proxy/v1/auth/mfa/verify

printf '\n--- verify headers ---\n' >> "$OUT"
cat "$TMP/verify_headers.txt" >> "$OUT"
printf '\n--- verify body ---\n' >> "$OUT"
cat "$TMP/verify_body.txt" >> "$OUT"

SESSION=$(grep -o 'osc_session=[^;]*' "$TMP/verify_headers.txt" | head -n1 | cut -d= -f2- || true)
printf 'SESSION=%s\n' "$SESSION" >> "$OUT"
if [ -z "$SESSION" ]; then
  echo 'FAILED: missing osc_session cookie' >> "$OUT"
  exit 1
fi

TOKEN=$(docker exec osc_site sh -lc "curl -sS -H 'Content-Type: application/json' -H 'Accept: application/json' -H 'Authorization: Bearer $SESSION' -d '{\"node_type\":\"HOST\",\"ttl_hours\":24}' http://osc_rest:8000/api/v1/agents/enrollment-tokens")
printf '\n--- token body ---\n' >> "$OUT"
printf '%s\n' "$TOKEN" >> "$OUT"

JSON_TOKEN=$(printf '%s' "$TOKEN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["token"])' 2>/dev/null || true)
printf 'TOKEN=%s\n' "$JSON_TOKEN" >> "$OUT"
if [ -z "$JSON_TOKEN" ]; then
  echo 'FAILED: token generation returned no token' >> "$OUT"
  exit 1
fi

ENROLL=$(docker exec osc_site sh -lc "curl -sS -D /tmp/enroll_headers.txt -o /tmp/enroll_body.txt -H 'Content-Type: application/json' -H 'Accept: application/json' -d '{\"enrollment_token\":\"$JSON_TOKEN\",\"hostname\":\"omnisight-agent-01\",\"mgmt_ip\":\"10.10.0.10\",\"asset_model_id\":\"d73d224b-4ccd-42a6-89c2-87d9d1ee4687\",\"status_label_id\":\"ab0c96ba-ea5d-4e9f-ac7a-438c84388019\",\"asset_tag\":\"AG-TEST-001\",\"agent_version\":\"v0.1.0\"}' http://osc_rest:8000/api/v1/agents/enroll && cat /tmp/enroll_headers.txt && printf '\n--- enroll body ---\n' && cat /tmp/enroll_body.txt")
printf '\n--- enroll result ---\n' >> "$OUT"
printf '%s\n' "$ENROLL" >> "$OUT"

printf '\nEXIT=0\n' >> "$OUT"
