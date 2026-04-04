-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "images" TEXT NOT NULL DEFAULT '[]',
    "price" TEXT NOT NULL DEFAULT '',
    "shopName" TEXT NOT NULL DEFAULT '',
    "usp" TEXT NOT NULL DEFAULT '',
    "targetAudience" TEXT NOT NULL DEFAULT '',
    "videoReady" BOOLEAN NOT NULL DEFAULT false,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Product" ("createdAt", "description", "id", "images", "price", "scrapedAt", "shopName", "title", "updatedAt", "url", "videoReady") SELECT "createdAt", "description", "id", "images", "price", "scrapedAt", "shopName", "title", "updatedAt", "url", "videoReady" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_url_key" ON "Product"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
