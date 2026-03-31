-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "videoType" TEXT NOT NULL DEFAULT 'fungsi_produk',
    "imageOnly" BOOLEAN NOT NULL DEFAULT false,
    "referenceImage" TEXT NOT NULL DEFAULT '',
    "referenceImages" TEXT NOT NULL DEFAULT '[]',
    "imagePrompt" TEXT NOT NULL DEFAULT '',
    "videoPrompt" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT NOT NULL DEFAULT '',
    "tiktokCaption" TEXT NOT NULL DEFAULT '',
    "tiktokHashtags" TEXT NOT NULL DEFAULT '[]',
    "tiktokProductName" TEXT NOT NULL DEFAULT '',
    "tiktokDescription" TEXT NOT NULL DEFAULT '',
    "tiktokPostUrl" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT NOT NULL DEFAULT '',
    "templateId" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VideoJob" ("createdAt", "errorMessage", "id", "imageOnly", "imagePrompt", "imageUrl", "lastError", "maxRetries", "productId", "referenceImage", "retryCount", "startedAt", "status", "templateId", "tiktokCaption", "tiktokDescription", "tiktokHashtags", "tiktokPostUrl", "tiktokProductName", "updatedAt", "videoPrompt", "videoType", "videoUrl") SELECT "createdAt", "errorMessage", "id", "imageOnly", "imagePrompt", "imageUrl", "lastError", "maxRetries", "productId", "referenceImage", "retryCount", "startedAt", "status", "templateId", "tiktokCaption", "tiktokDescription", "tiktokHashtags", "tiktokPostUrl", "tiktokProductName", "updatedAt", "videoPrompt", "videoType", "videoUrl" FROM "VideoJob";
DROP TABLE "VideoJob";
ALTER TABLE "new_VideoJob" RENAME TO "VideoJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
