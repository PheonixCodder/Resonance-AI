-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "triggerRunId" TEXT;

-- CreateIndex
CREATE INDEX "Generation_status_idx" ON "Generation"("status");

-- Backfill existing generations that already have audio
UPDATE "Generation" SET "status" = 'COMPLETED' WHERE "r2ObjectKey" IS NOT NULL;
