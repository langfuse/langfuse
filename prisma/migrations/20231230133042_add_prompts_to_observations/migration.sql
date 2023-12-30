-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "prompt_id" TEXT;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
