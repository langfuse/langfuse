import { useQueryProject } from "@/src/features/projects/hooks";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function ProjectBillingRedirect() {
  const router = useRouter();

  const { organization } = useQueryProject();

  useEffect(() => {
    if (organization) {
      // Keeps a link's query, so ?plans=open still opens the plan dialog.
      const search = router.asPath.includes("?")
        ? router.asPath.slice(router.asPath.indexOf("?"))
        : "";
      router.replace(
        `/organization/${organization.id}/settings/billing${search}`,
      );
    }
  }, [organization, router]);

  return "Redirecting...";
}
