-- AlterTable
ALTER TABLE "datasets"
  ADD COLUMN "remote_experiment_enabled" BOOLEAN NOT NULL DEFAULT true;
