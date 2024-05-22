-- AddForeignKey
ALTER TABLE "annotation_config" ADD CONSTRAINT "annotation_config_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
