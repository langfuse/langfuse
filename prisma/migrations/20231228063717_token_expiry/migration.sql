/*
  Warnings:

  - You are about to drop the column `token` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[password_reset_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_token_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "token",
ADD COLUMN     "password_reset_token" TEXT,
ADD COLUMN     "token_expiry_time" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_password_reset_token_key" ON "users"("password_reset_token");
