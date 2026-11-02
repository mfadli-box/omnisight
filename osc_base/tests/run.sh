#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="omnisight-wp02-test-$$"
IMAGE="${POSTGRES_IMAGE:-postgres:17.11-alpine3.24}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'FAIL: docker is required for WP-02 database tests\n' >&2
  exit 1
fi

PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

printf 'Starting %s on 127.0.0.1:%s\n' "$IMAGE" "$PORT"
docker run -d --rm --name "$CONTAINER" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=omnisight \
  -p "127.0.0.1:${PORT}:5432" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d omnisight >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER" pg_isready -U postgres -d omnisight >/dev/null 2>&1; then
  printf 'FAIL: PostgreSQL did not become ready\n' >&2
  docker logs "$CONTAINER" >&2 || true
  exit 1
fi

cd "$ROOT"
export DATABASE_URL="postgresql://postgres@127.0.0.1:${PORT}/omnisight?schema=public"

printf 'Applying migrations to an empty database\n'
npx prisma migrate deploy --schema prisma/schema.prisma

psql_file() {
  local file="$1"
  docker exec -i "$CONTAINER" psql -U postgres -d omnisight -v ON_ERROR_STOP=1 -f - < "$file"
}

printf 'Seeding twice to prove idempotency\n'
psql_file prisma/seed.sql >/dev/null
psql_file prisma/seed.sql >/dev/null

printf 'Loading test helpers\n'
psql_file tests/00_helpers.sql >/dev/null

for test_file in tests/10_rls.sql tests/20_audit.sql tests/30_seed.sql tests/40_tenant_integrity.sql tests/50_partition_helper.sql; do
  printf 'Running %s\n' "$test_file"
  psql_file "$test_file" >/dev/null
done

printf 'PASS: WP-02 database checks\n'
