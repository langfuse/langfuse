/*
  Warnings:

  - You are about to drop the column `ownerId` on the `coldkeys` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `hotkeys` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `neurons` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `wallets` table. All the data in the column will be lost.
  - Added the required column `projectId` to the `coldkeys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectId` to the `hotkeys` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectId` to the `neurons` table without a default value. This is not possible if the table is not empty.
  - Added the required column `projectId` to the `wallets` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "coldkeys" DROP CONSTRAINT "coldkeys_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "hotkeys" DROP CONSTRAINT "hotkeys_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "neurons" DROP CONSTRAINT "neurons_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_ownerId_fkey";

-- AlterTable
ALTER TABLE "coldkeys" DROP COLUMN "ownerId",
ADD COLUMN     "projectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "hotkeys" DROP COLUMN "ownerId",
ADD COLUMN     "projectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "neurons" DROP COLUMN "ownerId",
ADD COLUMN     "projectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "wallets" DROP COLUMN "ownerId",
ADD COLUMN     "projectId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coldkeys" ADD CONSTRAINT "coldkeys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotkeys" ADD CONSTRAINT "hotkeys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neurons" ADD CONSTRAINT "neurons_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
