-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_annotation_config_id_fkey" FOREIGN KEY ("annotation_config_id") REFERENCES "annotation_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
