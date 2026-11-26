ALTER TABLE "dashboard_widgets"
ADD COLUMN "definition" JSONB,
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
