/*
  Warnings:

  - You are about to drop the column `source_ids` on the `action_executions` table. All the data in the column will be lost.
  - You are about to drop the column `eventVersion` on the `trigger_configurations` table. All the data in the column will be lost.
  - Added the required column `source_id` to the `action_executions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "action_executions" DROP COLUMN "source_ids",
ADD COLUMN     "source_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "trigger_configurations" DROP COLUMN "eventVersion";
