// import { TasksDetail } from "@/src/features/tasks/components/tasks-detail";
import { useRouter } from "next/router";

export default function BotDetailPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const botName = decodeURIComponent(router.query.botName as string);

  return <div>TODO: Implement BotDetailPage</div>;
  // return <TasksDetail projectId={projectId} botName={botName} />;
}
