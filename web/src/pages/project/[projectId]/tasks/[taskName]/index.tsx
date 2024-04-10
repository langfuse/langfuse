import { TasksDetail } from "@/src/features/tasks/components/tasks-detail";
import { useRouter } from "next/router";

export default function PromptDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const taskName = decodeURIComponent(router.query.taskName as string);

  return <TasksDetail projectId={projectId} taskName={taskName} />;
}
