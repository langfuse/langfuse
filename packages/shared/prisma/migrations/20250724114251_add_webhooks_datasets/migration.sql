-- AlterTable
ALTER TABLE "datasets" ADD COLUMN     "remote_experiment_payload" JSONB,
ADD COLUMN     "remote_experiment_url" TEXT;
