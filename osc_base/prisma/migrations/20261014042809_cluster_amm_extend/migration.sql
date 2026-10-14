-- CreateTable
CREATE TABLE "amm_manufacturer" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amm_asset_model" (
    "id" TEXT NOT NULL,
    "manufacturer_id" TEXT,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amm_asset_model_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "amm_manufacturer_company_id_idx" ON "amm_manufacturer"("company_id");

-- CreateIndex
CREATE INDEX "amm_asset_model_manufacturer_id_idx" ON "amm_asset_model"("manufacturer_id");
