-- CreateTable
CREATE TABLE "app_module" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "is_page" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "valuta" TEXT NOT NULL DEFAULT 'IDR',
    "vat_id" TEXT,
    "reg_no" TEXT,
    "address" TEXT,
    "tax_office" TEXT,
    "hris_link" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_company_module" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_company_module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_company_area" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_company_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullname" TEXT NOT NULL,
    "phone" TEXT,
    "company_id" TEXT NOT NULL DEFAULT '',
    "employee_id" TEXT,
    "location_id" TEXT,
    "department_id" TEXT,
    "division_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "job" TEXT NOT NULL DEFAULT '',
    "key" TEXT NOT NULL DEFAULT '',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_hris" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "totp_secret" TEXT,
    "locked_until" TIMESTAMP(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_company" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_area" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_area_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_privilege" (
    "id" TEXT NOT NULL,
    "user_company_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'HIDE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_privilege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token" VARCHAR(512) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "policy_id" TEXT,

    CONSTRAINT "app_user_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_action" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT,
    "module_code" TEXT,
    "action" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_type" VARCHAR(20) NOT NULL DEFAULT 'JWT',
    "token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "fingerprint" VARCHAR(128),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "device_id" VARCHAR(100),
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "impersonated_by" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_approval_step" (
    "id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'ANY_APPROVED',

    CONSTRAINT "app_approval_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_approval_sign" (
    "id" TEXT NOT NULL,
    "step_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "app_approval_sign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_signature_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_signature_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_signature_form" (
    "id" TEXT NOT NULL,
    "signature_type_id" TEXT,
    "step" INTEGER NOT NULL,
    "request_id" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'ANY_APPROVED',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_signature_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_signature_flag" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_signature_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_module_code_key" ON "app_module"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_company_code_key" ON "app_company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_company_module_company_id_module_id_key" ON "app_company_module"("company_id", "module_id");

-- CreateIndex
CREATE INDEX "app_company_area_company_id_idx" ON "app_company_area"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_company_area_company_id_code_key" ON "app_company_area"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_company_id_username_key" ON "app_user"("company_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_company_user_id_company_id_key" ON "app_user_company"("user_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_area_user_id_company_area_id_key" ON "app_user_area"("user_id", "company_area_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_privilege_user_company_id_module_id_key" ON "app_user_privilege"("user_company_id", "module_id");

-- CreateIndex
CREATE INDEX "app_user_session_user_id_idx" ON "app_user_session"("user_id");

-- CreateIndex
CREATE INDEX "app_user_session_session_token_idx" ON "app_user_session"("session_token");

-- CreateIndex
CREATE INDEX "app_user_session_status_idx" ON "app_user_session"("status");

-- CreateIndex
CREATE INDEX "app_user_action_user_id_idx" ON "app_user_action"("user_id");

-- CreateIndex
CREATE INDEX "app_user_action_company_id_idx" ON "app_user_action"("company_id");

-- CreateIndex
CREATE INDEX "app_user_token_user_id_revoked_at_idx" ON "app_user_token"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "app_user_token_token_type_idx" ON "app_user_token"("token_type");

-- CreateIndex
CREATE INDEX "app_user_token_refresh_expires_at_idx" ON "app_user_token"("refresh_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_token_token_key" ON "app_user_token"("token");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_token_refresh_token_key" ON "app_user_token"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "app_approval_step_type_id_step_key" ON "app_approval_step"("type_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "app_approval_sign_step_id_user_id_key" ON "app_approval_sign"("step_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_signature_type_code_key" ON "app_signature_type"("code");

-- CreateIndex
CREATE INDEX "app_signature_form_signature_type_id_idx" ON "app_signature_form"("signature_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_signature_form_request_id_step_key" ON "app_signature_form"("request_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "app_signature_flag_form_id_user_id_key" ON "app_signature_flag"("form_id", "user_id");

-- AddForeignKey
ALTER TABLE "app_module" ADD CONSTRAINT "app_module_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "app_module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_company_module" ADD CONSTRAINT "app_company_module_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "app_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_company_module" ADD CONSTRAINT "app_company_module_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "app_module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_company_area" ADD CONSTRAINT "app_company_area_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "app_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_company" ADD CONSTRAINT "app_user_company_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_company" ADD CONSTRAINT "app_user_company_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "app_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_area" ADD CONSTRAINT "app_user_area_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_area" ADD CONSTRAINT "app_user_area_company_area_id_fkey" FOREIGN KEY ("company_area_id") REFERENCES "app_company_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_privilege" ADD CONSTRAINT "app_user_privilege_user_company_id_fkey" FOREIGN KEY ("user_company_id") REFERENCES "app_user_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_privilege" ADD CONSTRAINT "app_user_privilege_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "app_module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_action" ADD CONSTRAINT "app_user_action_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user_token" ADD CONSTRAINT "app_user_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_approval_step" ADD CONSTRAINT "app_approval_step_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "app_signature_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_approval_sign" ADD CONSTRAINT "app_approval_sign_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "app_approval_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_approval_sign" ADD CONSTRAINT "app_approval_sign_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_signature_form" ADD CONSTRAINT "app_signature_form_signature_type_id_fkey" FOREIGN KEY ("signature_type_id") REFERENCES "app_signature_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_signature_flag" ADD CONSTRAINT "app_signature_flag_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "app_signature_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_signature_flag" ADD CONSTRAINT "app_signature_flag_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
