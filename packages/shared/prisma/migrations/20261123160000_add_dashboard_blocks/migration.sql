CREATE TYPE "DashboardBlockKind" AS ENUM ('multiQuery', 'markdown');

CREATE TABLE "dashboard_blocks" (
    "dashboard_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "kind" "DashboardBlockKind" NOT NULL,
    "config" JSONB NOT NULL,
    "before_placement_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_blocks_pkey" PRIMARY KEY ("dashboard_id", "id"),
    CONSTRAINT "dashboard_blocks_dashboard_id_fkey" FOREIGN KEY ("dashboard_id")
        REFERENCES "dashboards"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
