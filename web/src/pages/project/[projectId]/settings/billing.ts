import { useQueryProject } from "@/src/features/projects/hooks";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function ProjectBillingRedirect() {
  const router = useRouter();

  const { organization } = useQueryProject();

  useEffect(() => {
    if (organization) {
      router.replace(`/organization/${organization.id}/settings/billing`);
    }
  }, [organization, router]);

  return "Redirecting...";
}
