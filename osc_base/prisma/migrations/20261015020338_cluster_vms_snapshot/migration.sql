-- CreateTable
CREATE TABLE "vms_snapshot" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vms_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vms_snapshot_guest_id_idx" ON "vms_snapshot"("guest_id");

-- AddForeignKey
ALTER TABLE "vms_snapshot" ADD CONSTRAINT "vms_snapshot_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "vms_guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
