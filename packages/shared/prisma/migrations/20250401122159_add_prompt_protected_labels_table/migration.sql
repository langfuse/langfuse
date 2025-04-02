-- CreateTable
CREATE TABLE "prompt_protected_labels" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "prompt_protected_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_protected_labels_project_id_label_key" ON "prompt_protected_labels"("project_id", "label");

-- AddForeignKey
ALTER TABLE "prompt_protected_labels" ADD CONSTRAINT "prompt_protected_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
