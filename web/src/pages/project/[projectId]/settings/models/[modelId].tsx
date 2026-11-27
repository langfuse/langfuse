import { useRouter } from "next/router";

import { ModelDetailPage } from "@/src/features/models/ModelDetailPage";

export default function ProjectModelDetailRoute() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  return <ModelDetailPage owner={{ scope: "project", projectId }} />;
}
