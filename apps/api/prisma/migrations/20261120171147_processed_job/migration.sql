-- CreateTable
CREATE TABLE "ProcessedJob" (
    "jobId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedJob_pkey" PRIMARY KEY ("jobId")
);

-- CreateIndex
CREATE INDEX "ProcessedJob_processedAt_idx" ON "ProcessedJob"("processedAt");
