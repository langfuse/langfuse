import { useState } from "react";
import { useRouter } from "next/router";
import { Sparkles } from "lucide-react";

import Page from "@/src/components/layouts/page";
import { EvaluatorGalleryDialog } from "@/src/features/evals/v2/components/EvaluatorGalleryDialog";
import {
  RuleSetupForm,
  type CatalogTemplate,
} from "@/src/features/evals/v2/components/RuleSetupForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SupportOrUpgradePage } from "@/src/ee/features/billing/components/SupportOrUpgradePage";

export default function NewEvaluationRulePage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [template, setTemplate] = useState<CatalogTemplate | null>(null);
  const [scratchType, setScratchType] = useState<"llm" | "code" | null>(null);

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const galleryOpen = !template && !scratchType;

  if (!hasWriteAccess) {
    return <SupportOrUpgradePage />;
  }

  return (
    <Page
      headerProps={{
        title: "New evaluator",
        breadcrumb: [
          { name: "Evaluators", href: `/project/${projectId}/evals` },
        ],
        help: {
          description:
            "Prototype: pick an evaluator or write one from scratch (LLM-as-a-judge or code), map variables against a real trace, pick where it runs via a shared run scope, test it, and save it as a draft or active — all in one place.",
        },
      }}
    >
      <EvaluatorGalleryDialog
        projectId={projectId}
        open={galleryOpen}
        onOpenChange={(open) => {
          // Closing the gallery without a selection leaves nothing to
          // configure — go back to the evaluators list.
          if (!open && galleryOpen) {
            router.push(`/project/${projectId}/evals`).catch(() => undefined);
          }
        }}
        onSelectTemplate={(t) => {
          setTemplate(t);
          setScratchType(null);
        }}
        onCreateFromScratch={(type) => {
          setTemplate(null);
          setScratchType(type);
        }}
      />

      {galleryOpen ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground flex flex-col items-center gap-2">
            <Sparkles className="h-6 w-6" />
            <p className="text-sm">Pick an evaluator to get started</p>
          </div>
        </div>
      ) : (
        <RuleSetupForm
          key={template?.id ?? `scratch-${scratchType}`}
          projectId={projectId}
          sourceTemplate={template}
          initialEvaluatorType={scratchType ?? "llm"}
          onChangeEvaluator={() => {
            setTemplate(null);
            setScratchType(null);
          }}
        />
      )}
    </Page>
  );
}
