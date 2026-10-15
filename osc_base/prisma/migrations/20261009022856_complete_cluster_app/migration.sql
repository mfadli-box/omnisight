-- CreateIndex
CREATE INDEX "app_approval_sign_user_id_idx" ON "app_approval_sign"("user_id");

-- CreateIndex
CREATE INDEX "app_module_parent_id_idx" ON "app_module"("parent_id");

-- CreateIndex
CREATE INDEX "app_signature_flag_user_id_idx" ON "app_signature_flag"("user_id");

-- AddForeignKey
ALTER TABLE "app_user_session" ADD CONSTRAINT "app_user_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
