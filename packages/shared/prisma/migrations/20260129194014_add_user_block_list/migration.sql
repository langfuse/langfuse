-- CreateTable
CREATE TABLE "user_block_list" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_block_list_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_block_list_project_id_user_id_key" ON "user_block_list"("project_id", "user_id");

-- AddForeignKey
ALTER TABLE "user_block_list" ADD CONSTRAINT "user_block_list_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
