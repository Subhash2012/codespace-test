-- CreateTable
CREATE TABLE "PointLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "sourcePurchaseId" TEXT,
    "originalPoints" INTEGER NOT NULL,
    "remainingPoints" INTEGER NOT NULL,
    "earnedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PointLot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PointLot_sourcePurchaseId_fkey" FOREIGN KEY ("sourcePurchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "previousTier" TEXT,
    "newTier" TEXT,
    "payload" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "errorMessage" TEXT,
    CONSTRAINT "NotificationOutbox_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
