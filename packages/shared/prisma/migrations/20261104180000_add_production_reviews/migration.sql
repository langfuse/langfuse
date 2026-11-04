-- CreateTable
CREATE TABLE "production_reviews" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_reviews_project_id_created_at_idx" ON "production_reviews"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "production_reviews" ADD CONSTRAINT "production_reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
