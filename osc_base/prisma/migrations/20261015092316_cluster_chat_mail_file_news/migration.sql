-- CreateTable
CREATE TABLE "app_announcement" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "category" TEXT,
    "target_type" TEXT NOT NULL DEFAULT 'ALL',
    "target_id" TEXT,
    "publish_at" TIMESTAMP(3),
    "expire_at" TIMESTAMP(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_announcement_read" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_announcement_read_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'GROUP',
    "name" TEXT,
    "created_by" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_member" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "last_read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "body" TEXT,
    "attachment_id" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_reaction" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_folder" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "owner_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_file" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "folder_id" TEXT,
    "name" TEXT NOT NULL,
    "mime" TEXT,
    "size_bytes" BIGINT,
    "checksum" TEXT,
    "storage" TEXT NOT NULL DEFAULT 'LOCAL',
    "path" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "owner_id" TEXT,
    "scan_status" TEXT NOT NULL DEFAULT 'PENDING',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_file_version" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "size_bytes" BIGINT,
    "checksum" TEXT,
    "path" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_file_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_share" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "file_id" TEXT,
    "folder_id" TEXT,
    "grantee_user_id" TEXT,
    "grantee_company_id" TEXT,
    "access" TEXT NOT NULL DEFAULT 'VIEW',
    "token" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_quota" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT 'USER',
    "owner_id" TEXT,
    "quota_bytes" BIGINT,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_account" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_tls" BOOLEAN NOT NULL DEFAULT true,
    "imap_host" TEXT,
    "imap_port" INTEGER,
    "username" TEXT,
    "secret_enc" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_message" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "account_id" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'OUT',
    "sender" TEXT,
    "recipients" JSONB,
    "cc" JSONB,
    "bcc" JSONB,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_attachment" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "file_id" TEXT,
    "name" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "mime" TEXT,
    "path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_announcement_company_id_idx" ON "app_announcement"("company_id");

-- CreateIndex
CREATE INDEX "app_announcement_publish_at_idx" ON "app_announcement"("publish_at");

-- CreateIndex
CREATE INDEX "app_announcement_read_user_id_idx" ON "app_announcement_read"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_announcement_read_announcement_id_user_id_key" ON "app_announcement_read"("announcement_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_room_company_id_idx" ON "chat_room"("company_id");

-- CreateIndex
CREATE INDEX "chat_member_room_id_idx" ON "chat_member"("room_id");

-- CreateIndex
CREATE INDEX "chat_member_user_id_idx" ON "chat_member"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_member_room_id_user_id_key" ON "chat_member"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_message_room_id_sent_at_idx" ON "chat_message"("room_id", "sent_at");

-- CreateIndex
CREATE INDEX "chat_reaction_message_id_idx" ON "chat_reaction"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_reaction_message_id_user_id_emoji_key" ON "chat_reaction"("message_id", "user_id", "emoji");

-- CreateIndex
CREATE INDEX "doc_folder_company_id_idx" ON "doc_folder"("company_id");

-- CreateIndex
CREATE INDEX "doc_folder_parent_id_idx" ON "doc_folder"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_folder_company_id_parent_id_name_key" ON "doc_folder"("company_id", "parent_id", "name");

-- CreateIndex
CREATE INDEX "doc_file_company_id_idx" ON "doc_file"("company_id");

-- CreateIndex
CREATE INDEX "doc_file_folder_id_idx" ON "doc_file"("folder_id");

-- CreateIndex
CREATE INDEX "doc_file_owner_id_idx" ON "doc_file"("owner_id");

-- CreateIndex
CREATE INDEX "doc_file_version_file_id_idx" ON "doc_file_version"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_file_version_file_id_version_key" ON "doc_file_version"("file_id", "version");

-- CreateIndex
CREATE INDEX "doc_share_company_id_idx" ON "doc_share"("company_id");

-- CreateIndex
CREATE INDEX "doc_share_file_id_idx" ON "doc_share"("file_id");

-- CreateIndex
CREATE INDEX "doc_share_folder_id_idx" ON "doc_share"("folder_id");

-- CreateIndex
CREATE INDEX "doc_share_token_idx" ON "doc_share"("token");

-- CreateIndex
CREATE INDEX "doc_quota_company_id_idx" ON "doc_quota"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_quota_company_id_scope_owner_id_key" ON "doc_quota"("company_id", "scope", "owner_id");

-- CreateIndex
CREATE INDEX "mail_account_company_id_idx" ON "mail_account"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "mail_account_company_id_address_key" ON "mail_account"("company_id", "address");

-- CreateIndex
CREATE INDEX "mail_message_company_id_created_at_idx" ON "mail_message"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "mail_message_account_id_idx" ON "mail_message"("account_id");

-- CreateIndex
CREATE INDEX "mail_message_direction_idx" ON "mail_message"("direction");

-- CreateIndex
CREATE INDEX "mail_attachment_message_id_idx" ON "mail_attachment"("message_id");

-- AddForeignKey
ALTER TABLE "app_announcement_read" ADD CONSTRAINT "app_announcement_read_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "app_announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_member" ADD CONSTRAINT "chat_member_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_reaction" ADD CONSTRAINT "chat_reaction_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_folder" ADD CONSTRAINT "doc_folder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "doc_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_file" ADD CONSTRAINT "doc_file_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "doc_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_file_version" ADD CONSTRAINT "doc_file_version_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "doc_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_message" ADD CONSTRAINT "mail_message_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "mail_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_attachment" ADD CONSTRAINT "mail_attachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "mail_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
