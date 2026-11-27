#!/bin/sh

(
    set -eu
    : "${POSTGRES_APP_PASSWORD:?Set POSTGRES_APP_PASSWORD for the API role}"

    psql --no-psqlrc --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        --set ON_ERROR_STOP=1 --single-transaction \
        --file=/opt/omnisight/init/01_dat.sql \
        --file=/opt/omnisight/init/02_tsx.sql \
        --file=/opt/omnisight/init/03_log.sql \
        --file=- <<'SQL'
\getenv app_password POSTGRES_APP_PASSWORD
CREATE ROLE omnisight_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD :'app_password';
GRANT USAGE ON SCHEMA public TO omnisight_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO omnisight_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO omnisight_app;
SQL
)
