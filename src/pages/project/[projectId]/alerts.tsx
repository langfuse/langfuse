import Header from "@/src/components/layouts/header";
import { AlertsTable } from "@/src/features/alerts/AlertsTable";
import { useRouter } from "next/router";

export default function Alerts() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div>
      <Header title="Alerts" />
      <AlertsTable projectId={projectId} />
    </div>
  );
}
