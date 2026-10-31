-- WP-02 foundation migration: core, audit, and platform schemas.
-- Generated from osc_docs/technical/contracts/schema.prisma with:
--   npx prisma migrate diff --from-empty --to-schema-datamodel <schema> --script
-- The login_attempts table was edited to be range-partitioned by created_at.
-- RLS, grants, composite foreign keys, partial unique indexes, CHECK constraints,
-- and the audit hash-chain function are added in the following migrations.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "asset";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "content";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "monitor";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "network";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ops";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "platform";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "service";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "ltree";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "core"."companies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(240),
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."areas" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "path" ltree NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" VARCHAR(32) NOT NULL DEFAULT 'branch',
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."locations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" VARCHAR(32) NOT NULL DEFAULT 'site',
    "address" JSONB NOT NULL DEFAULT '{}',
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "password_hash" TEXT,
    "password_updated_at" TIMESTAMPTZ(6),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret_ref" TEXT,
    "locale" VARCHAR(16) NOT NULL DEFAULT 'en',
    "last_login_at" TIMESTAMPTZ(6),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_subject" VARCHAR(240) NOT NULL,
    "company_id" UUID,
    "email_at_provider" CITEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."company_memberships" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_no" VARCHAR(64),
    "job_title" VARCHAR(160),
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "default_area_id" UUID,
    "joined_at" TIMESTAMPTZ(6) NOT NULL,
    "left_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."membership_roles" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(16) NOT NULL,
    "scope_id" UUID,
    "granted_by" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."user_platform_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_code" VARCHAR(32) NOT NULL,
    "granted_by" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_platform_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."permissions" (
    "id" UUID NOT NULL,
    "module_code" VARCHAR(16) NOT NULL,
    "action" VARCHAR(8) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."roles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(48) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "core"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active_company_id" UUID,
    "device_id" VARCHAR(128),
    "ip" INET NOT NULL,
    "user_agent" TEXT NOT NULL,
    "auth_method" VARCHAR(16) NOT NULL,
    "mfa_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(64),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "family_id" UUID NOT NULL,
    "rotated_from" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "reason" VARCHAR(64),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."login_attempts" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "identifier_hash" BYTEA NOT NULL,
    "identifier_masked" VARCHAR(80),
    "method" VARCHAR(16) NOT NULL,
    "result" VARCHAR(16) NOT NULL,
    "failure_code" VARCHAR(48),
    "ip" INET NOT NULL,
    "user_agent" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id","created_at")
) PARTITION BY RANGE ("created_at");

-- CreateTable
CREATE TABLE "core"."hris_connections" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "base_url" TEXT NOT NULL,
    "auth_type" VARCHAR(24) NOT NULL,
    "credential_ref" TEXT NOT NULL,
    "extra_headers" JSONB NOT NULL DEFAULT '{}',
    "tls_policy" VARCHAR(24) NOT NULL DEFAULT 'verify_full',
    "timeout_ms" INTEGER NOT NULL DEFAULT 5000,
    "max_retries" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hris_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."hris_login_rules" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "match_conditions" JSONB NOT NULL DEFAULT '{}',
    "request_spec" JSONB NOT NULL,
    "success_when" JSONB NOT NULL,
    "field_map" JSONB NOT NULL,
    "role_map" JSONB NOT NULL DEFAULT '{}',
    "failure_map" JSONB NOT NULL DEFAULT '[]',
    "fallback_policy" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hris_login_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."hris_login_logs" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "rule_id" UUID,
    "identifier_hash" BYTEA NOT NULL,
    "result" VARCHAR(16) NOT NULL,
    "http_status" INTEGER,
    "failure_code" VARCHAR(48),
    "latency_ms" INTEGER NOT NULL,
    "response_hash" BYTEA,
    "request_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hris_login_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."vendors" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "category" VARCHAR(64),
    "contact" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."files" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime" VARCHAR(128) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" BYTEA NOT NULL,
    "classification" VARCHAR(16) NOT NULL DEFAULT 'internal',
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."api_keys" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "key_hash" BYTEA NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_events" (
    "id" UUID NOT NULL,
    "chain_key" VARCHAR(64) NOT NULL,
    "seq" BIGINT NOT NULL,
    "company_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "actor_type" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID,
    "actor_label" VARCHAR(160),
    "action" VARCHAR(64) NOT NULL,
    "module_code" VARCHAR(16) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID,
    "scope_type" VARCHAR(16),
    "scope_id" UUID,
    "request_id" UUID NOT NULL,
    "ip" INET,
    "user_agent" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "prev_hash" BYTEA NOT NULL,
    "hash" BYTEA NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_chain_heads" (
    "chain_key" VARCHAR(64) NOT NULL,
    "last_seq" BIGINT NOT NULL DEFAULT 0,
    "last_hash" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_chain_heads_pkey" PRIMARY KEY ("chain_key")
);

-- CreateTable
CREATE TABLE "audit"."security_events" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "external_rule_id" VARCHAR(64),
    "severity" VARCHAR(16) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "src_ip" INET,
    "dst_ip" INET,
    "agent_ref" VARCHAR(120),
    "raw_ref" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'new',
    "assignee_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."access_reviews" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "reviewer_user_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "access_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."access_review_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(16) NOT NULL,
    "scope_id" UUID,
    "decision" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "note" TEXT,

    CONSTRAINT "access_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."data_retention_policies" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "data_class" VARCHAR(32) NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."integration_endpoints" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "kind" VARCHAR(32) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "base_url" TEXT NOT NULL,
    "credential_ref" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "last_checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."integration_links" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "local_type" VARCHAR(48) NOT NULL,
    "local_id" UUID NOT NULL,
    "external_type" VARCHAR(48) NOT NULL,
    "external_id" VARCHAR(160) NOT NULL,
    "sync_direction" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "integration_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."webhooks" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "url" TEXT NOT NULL,
    "secret_ref" TEXT NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_delivery_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."webhook_deliveries" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "payload_ref" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "response_code" INTEGER,
    "next_retry_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."settings" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "key" VARCHAR(120) NOT NULL,
    "value" JSONB NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."feature_flags" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "key" VARCHAR(120) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."outbox_events" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "aggregate_type" VARCHAR(48) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."impersonation_sessions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "request_id" UUID NOT NULL,
    "actions_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "core"."companies"("code");

-- CreateIndex
CREATE INDEX "companies_status_idx" ON "core"."companies"("status");

-- CreateIndex
CREATE INDEX "areas_company_id_parent_id_idx" ON "core"."areas"("company_id", "parent_id");

-- CreateIndex
CREATE INDEX "areas_company_id_status_idx" ON "core"."areas"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "areas_company_id_id_key" ON "core"."areas"("company_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "areas_company_id_code_key" ON "core"."areas"("company_id", "code");

-- CreateIndex
CREATE INDEX "locations_company_id_area_id_status_idx" ON "core"."locations"("company_id", "area_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_area_id_id_key" ON "core"."locations"("company_id", "area_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_area_id_code_key" ON "core"."locations"("company_id", "area_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "core"."users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "core"."users"("status");

-- CreateIndex
CREATE INDEX "user_identities_user_id_idx" ON "core"."user_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_identities_provider_company_id_provider_subject_key" ON "core"."user_identities"("provider", "company_id", "provider_subject");

-- CreateIndex
CREATE INDEX "company_memberships_company_id_status_idx" ON "core"."company_memberships"("company_id", "status");

-- CreateIndex
CREATE INDEX "company_memberships_user_id_idx" ON "core"."company_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_memberships_company_id_user_id_key" ON "core"."company_memberships"("company_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_memberships_company_id_employee_no_key" ON "core"."company_memberships"("company_id", "employee_no");

-- CreateIndex
CREATE INDEX "membership_roles_role_id_idx" ON "core"."membership_roles"("role_id");

-- CreateIndex
CREATE INDEX "membership_roles_scope_type_scope_id_idx" ON "core"."membership_roles"("scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_roles_membership_id_role_id_scope_type_scope_id_key" ON "core"."membership_roles"("membership_id", "role_id", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_platform_roles_user_id_role_code_key" ON "core"."user_platform_roles"("user_id", "role_code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_code_action_key" ON "core"."permissions"("module_code", "action");

-- CreateIndex
CREATE INDEX "roles_company_id_is_system_idx" ON "core"."roles"("company_id", "is_system");

-- CreateIndex
CREATE UNIQUE INDEX "roles_company_id_code_key" ON "core"."roles"("company_id", "code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "core"."role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "core"."sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_active_company_id_idx" ON "core"."sessions"("active_company_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "core"."sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "core"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "core"."refresh_tokens"("session_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "core"."refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "core"."refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "login_attempts_company_id_created_at_idx" ON "core"."login_attempts"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_identifier_hash_created_at_idx" ON "core"."login_attempts"("identifier_hash", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_result_created_at_idx" ON "core"."login_attempts"("result", "created_at");

-- CreateIndex
CREATE INDEX "hris_connections_company_id_status_idx" ON "core"."hris_connections"("company_id", "status");

-- CreateIndex
CREATE INDEX "hris_login_rules_connection_id_is_active_priority_idx" ON "core"."hris_login_rules"("connection_id", "is_active", "priority");

-- CreateIndex
CREATE INDEX "hris_login_logs_connection_id_created_at_idx" ON "core"."hris_login_logs"("connection_id", "created_at");

-- CreateIndex
CREATE INDEX "hris_login_logs_result_created_at_idx" ON "core"."hris_login_logs"("result", "created_at");

-- CreateIndex
CREATE INDEX "vendors_company_id_status_idx" ON "core"."vendors"("company_id", "status");

-- CreateIndex
CREATE INDEX "files_company_id_created_at_idx" ON "core"."files"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "files_sha256_idx" ON "core"."files"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "core"."api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_company_id_key_prefix_idx" ON "core"."api_keys"("company_id", "key_prefix");

-- CreateIndex
CREATE INDEX "audit_events_company_id_occurred_at_idx" ON "audit"."audit_events"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit"."audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit"."audit_events"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_chain_key_seq_key" ON "audit"."audit_events"("chain_key", "seq");

-- CreateIndex
CREATE INDEX "security_events_company_id_occurred_at_idx" ON "audit"."security_events"("company_id", "occurred_at");

-- CreateIndex
CREATE INDEX "security_events_company_id_status_severity_idx" ON "audit"."security_events"("company_id", "status", "severity");

-- CreateIndex
CREATE INDEX "access_reviews_company_id_status_due_at_idx" ON "audit"."access_reviews"("company_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "access_review_items_company_id_decision_idx" ON "audit"."access_review_items"("company_id", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "access_review_items_review_id_membership_id_role_id_scope_t_key" ON "audit"."access_review_items"("review_id", "membership_id", "role_id", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_policies_company_id_data_class_key" ON "audit"."data_retention_policies"("company_id", "data_class");

-- CreateIndex
CREATE INDEX "integration_endpoints_company_id_kind_status_idx" ON "platform"."integration_endpoints"("company_id", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_endpoints_company_id_name_key" ON "platform"."integration_endpoints"("company_id", "name");

-- CreateIndex
CREATE INDEX "integration_links_company_id_status_idx" ON "platform"."integration_links"("company_id", "status");

-- CreateIndex
CREATE INDEX "integration_links_external_type_external_id_idx" ON "platform"."integration_links"("external_type", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_links_integration_id_local_type_local_id_key" ON "platform"."integration_links"("integration_id", "local_type", "local_id");

-- CreateIndex
CREATE INDEX "webhooks_company_id_enabled_idx" ON "platform"."webhooks"("company_id", "enabled");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_status_idx" ON "platform"."webhook_deliveries"("webhook_id", "status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_company_id_created_at_idx" ON "platform"."webhook_deliveries"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "settings_company_id_key_key" ON "platform"."settings"("company_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_company_id_key_key" ON "platform"."feature_flags"("company_id", "key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "platform"."outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_company_id_created_at_idx" ON "platform"."outbox_events"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "impersonation_sessions_company_id_started_at_idx" ON "platform"."impersonation_sessions"("company_id", "started_at");

-- CreateIndex
CREATE INDEX "impersonation_sessions_actor_user_id_started_at_idx" ON "platform"."impersonation_sessions"("actor_user_id", "started_at");

-- AddForeignKey
ALTER TABLE "core"."areas" ADD CONSTRAINT "areas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."locations" ADD CONSTRAINT "locations_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "core"."areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."company_memberships" ADD CONSTRAINT "company_memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."company_memberships" ADD CONSTRAINT "company_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "core"."company_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_platform_roles" ADD CONSTRAINT "user_platform_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."roles" ADD CONSTRAINT "roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "core"."sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."hris_connections" ADD CONSTRAINT "hris_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."hris_login_rules" ADD CONSTRAINT "hris_login_rules_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "core"."hris_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."hris_login_logs" ADD CONSTRAINT "hris_login_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "core"."hris_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."vendors" ADD CONSTRAINT "vendors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."files" ADD CONSTRAINT "files_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."api_keys" ADD CONSTRAINT "api_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "core"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."access_review_items" ADD CONSTRAINT "access_review_items_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "audit"."access_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "platform"."webhooks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
