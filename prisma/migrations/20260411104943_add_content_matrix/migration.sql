-- CreateTable
CREATE TABLE "ContentMatrix" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" TEXT NOT NULL,
    "targets" TEXT NOT NULL DEFAULT '[]',
    "scenarios" TEXT NOT NULL DEFAULT '[]',
    "usps" TEXT NOT NULL DEFAULT '[]',
    "usedCombos" TEXT NOT NULL DEFAULT '[]',
    "phase" INTEGER NOT NULL DEFAULT 1,
    "mode" TEXT NOT NULL DEFAULT 'gemini',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentMatrix_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentMatrix_productId_key" ON "ContentMatrix"("productId");
