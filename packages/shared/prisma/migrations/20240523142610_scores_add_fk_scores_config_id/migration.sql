-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "score_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
