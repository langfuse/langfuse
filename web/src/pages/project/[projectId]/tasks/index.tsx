import Header from "@/src/components/layouts/header";
import { TasksTable } from "@/src/features/tasks/components/tasks-table";
import { useRouter } from "next/router";

export default function Prompts() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="xl:container">
      <Header
        title="Tasks"
        help={{
          description:
            "Manage and customize your tasks in Langfuse. Register them via the UI and SDK then customize their UI in the UI. Retrieve the production version via the SDKs. Learn more in the docs.",
          href: "https://langfuse.com/docs/tasks?????",
        }}
      />
      <TasksTable projectId={projectId} />
    </div>
  );
}
