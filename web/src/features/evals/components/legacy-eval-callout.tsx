import { useState } from "react";
import { Callout } from "@/src/components/ui/callout";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";
import { RemapEvalWizard } from "@/src/features/evals/components/remap-eval-wizard";
import { api } from "@/src/utils/api";

interface LegacyEvalCalloutProps {
  projectId: string;
  evalConfigId: string;
  targetObject: string;
}

export function LegacyEvalCallout({
  projectId,
  evalConfigId,
  targetObject,
}: LegacyEvalCalloutProps) {
  const [remapModalOpen, setRemapModalOpen] = useState(false);
  const utils = api.useUtils();

  const isDeprecated = isLegacyEvalTarget(targetObject);

  if (!isDeprecated) return null;

  const text =
    targetObject === "trace"
      ? "Running evaluators on traces will be deprecated. Upgrade to run on observations for full compatibility."
      : "Running evaluators on offline experiments without OpenTelemetry will be deprecated. Upgrade to run on offline experiments with OpenTelemetry for full compatibility.";

  return (
    <>
      <Callout
        id={`eval-remapping-peek-${evalConfigId}`}
        variant="info"
        key="dismissed-eval-remapping-callouts"
        actions={() => (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRemapModalOpen(true)}
              className="h-7 text-xs text-dark-blue hover:opacity-80"
            >
              Upgrade
            </Button>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-7 gap-1 text-xs text-dark-blue hover:opacity-80"
            >
              <Link
                href="https://langfuse.com/docs/evals/remapping"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more
                <ExternalLink className="h-3 w-3" />
              </Link>
            </Button>
          </>
        )}
      >
        <span>{text}</span>
      </Callout>

      <RemapEvalWizard
        projectId={projectId}
        evalConfigId={evalConfigId}
        open={remapModalOpen}
        onOpenChange={setRemapModalOpen}
        onSuccess={() => {
          // Invalidate queries to refresh the table
          utils.evals.invalidate();
        }}
      />
    </>
  );
}
