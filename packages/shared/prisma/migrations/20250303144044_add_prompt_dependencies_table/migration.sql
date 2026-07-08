CREATE TABLE "prompt_dependencies" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "child_name" TEXT NOT NULL,
    "child_label" TEXT,
    "child_version" INTEGER,

    CONSTRAINT "prompt_dependencies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "prompt_dependencies" ADD CONSTRAINT "prompt_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prompt_dependencies" ADD CONSTRAINT "prompt_dependencies_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "prompt_dependencies_project_id_parent_id" ON "prompt_dependencies"("project_id", "parent_id");
CREATE INDEX "prompt_dependencies_project_id_child_name" ON "prompt_dependencies"("project_id", "child_name");
