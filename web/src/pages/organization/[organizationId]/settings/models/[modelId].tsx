import { useRouter } from "next/router";

import { ModelDetailPage } from "@/src/features/models/ModelDetailPage";

export default function OrganizationModelDetailRoute() {
  const router = useRouter();
  const organizationId = router.query.organizationId as string;
  return <ModelDetailPage owner={{ scope: "organization", organizationId }} />;
}
