-- CreateEnum
CREATE TYPE "SurveyName" AS ENUM ('org_onboarding', 'user_onboarding');

-- CreateTable
CREATE TABLE "surveys" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "survey_name" "SurveyName" NOT NULL,
    "response" JSONB NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "org_id" TEXT,

    CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "annotation_queue_assignments_project_id_queue_id_key" RENAME TO "annotation_queue_assignments_project_id_queue_id_user_id_key";
