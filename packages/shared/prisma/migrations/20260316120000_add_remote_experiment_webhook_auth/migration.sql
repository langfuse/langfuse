-- AlterTable
ALTER TABLE "datasets" ADD COLUMN     "remote_experiment_secret_key" TEXT,
ADD COLUMN     "remote_experiment_display_secret_key" TEXT,
ADD COLUMN     "remote_experiment_headers" JSONB,
ADD COLUMN     "remote_experiment_display_headers" JSONB;
