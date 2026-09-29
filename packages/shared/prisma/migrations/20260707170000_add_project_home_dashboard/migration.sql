-- AlterTable
ALTER TABLE "projects" ADD COLUMN "home_dashboard_id" TEXT;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_home_dashboard_id_fkey" FOREIGN KEY ("home_dashboard_id") REFERENCES "dashboards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
