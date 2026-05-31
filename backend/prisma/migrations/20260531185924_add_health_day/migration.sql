-- CreateTable
CREATE TABLE "HealthDay" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "km" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthDay_date_key" ON "HealthDay"("date");
