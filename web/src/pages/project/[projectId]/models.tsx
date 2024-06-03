import Header from "@/src/components/layouts/header";

import { useRouter } from "next/router";
import ModelTable from "@/src/components/table/use-cases/models";
import { Button } from "@/src/components/ui/button";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { Lock } from "lucide-react";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";

export default function ModelsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const hasWriteAccess = useHasAccess({ projectId, scope: "models:CUD" });
  const capture = usePostHogClientCapture();
  return (
    <FullScreenPage>
      <Header
        title="Models"
        help={{
          description:
            "A model represents a LLM model. It is used to calculate tokens and cost.",
          href: "https://langfuse.com/docs/model-usage-and-cost",
        }}
        actionButtons={
          <Button
            variant="secondary"
            disabled={!hasWriteAccess}
            onClick={() => capture("models:new_form_open")}
            asChild
          >
            <Link
              href={hasWriteAccess ? `/project/${projectId}/models/new` : "#"}
            >
              {!hasWriteAccess && <Lock size={16} className="mr-2" />}
              Add model definition
            </Link>
          </Button>
        }
      />
      <ModelTable projectId={projectId} />
    </FullScreenPage>
  );
}
