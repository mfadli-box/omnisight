-- 002_user.sql
-- Identitas global. Akses tenant direpresentasikan terpisah pada osc_user_access.

CREATE TABLE public.osc_user (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username                 varchar(128) NOT NULL,
    email                    varchar(320),
    full_name                varchar(200) NOT NULL,
    password_hash            text,
    auth_source              varchar(16) NOT NULL DEFAULT 'LOCAL',
    last_hris_sync_at        timestamptz,
    mfa_enabled              boolean NOT NULL DEFAULT false,
    mfa_secret_encrypted     bytea,
    mfa_last_verified_step   bigint,
    mfa_last_verified_at     timestamptz,
    mfa_backup_codes_hash    jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active                boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT osc_user_auth_source_check
        CHECK (auth_source IN ('LOCAL', 'HRIS_ASMX', 'LDAP_AD', 'M365_OIDC')),
    CONSTRAINT osc_user_argon2id_hash_check
        CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%'),
    CONSTRAINT osc_user_active_local_hash_check
        CHECK (NOT (is_active AND auth_source = 'LOCAL') OR password_hash IS NOT NULL),
    CONSTRAINT osc_user_mfa_secret_check
        CHECK (NOT mfa_enabled OR mfa_secret_encrypted IS NOT NULL),
    CONSTRAINT osc_user_mfa_step_check
        CHECK (mfa_last_verified_step IS NULL OR mfa_last_verified_step >= 0),
    CONSTRAINT osc_user_backup_codes_array_check
        CHECK (jsonb_typeof(mfa_backup_codes_hash) = 'array')
);

CREATE UNIQUE INDEX osc_user_username_lower_key ON public.osc_user (lower(username));
CREATE UNIQUE INDEX osc_user_email_lower_key
    ON public.osc_user (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX osc_user_active_auth_source_idx
    ON public.osc_user (auth_source, is_active);

COMMENT ON COLUMN public.osc_user.password_hash IS
    'Hanya verifier berkode Argon2id; NULL diperbolehkan untuk identitas bootstrap nonaktif yang belum diprovisi.';
COMMENT ON COLUMN public.osc_user.mfa_secret_encrypted IS
    'Envelope AES-256-GCM terenkripsi oleh aplikasi (nonce + ciphertext + tag); material kunci harus tetap di luar PostgreSQL.';
COMMENT ON COLUMN public.osc_user.mfa_backup_codes_hash IS
    'Array JSON yang hanya berisi hash Argon2id. Jangan pernah menyimpan backup code dalam teks biasa.';
