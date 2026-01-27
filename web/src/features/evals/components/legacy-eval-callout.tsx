import { Callout } from "@/src/components/ui/callout";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";

interface LegacyEvalCalloutProps {
  evalConfigId: string;
  targetObject: string;
}

export function LegacyEvalCallout({
  evalConfigId,
  targetObject,
}: LegacyEvalCalloutProps) {
  const isDeprecated = isLegacyEvalTarget(targetObject);

  if (!isDeprecated) return null;

  const targetName =
    targetObject === "trace" ? "observation-level" : "experiment-level";

  return (
    <Callout
      id={`eval-remapping-peek-${evalConfigId}`}
      variant="info"
      key="dismissed-eval-remapping-callouts"
      actions={() => (
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
      )}
    >
      <span>
        This eval type is being deprecated. Remap to {targetName} for full
        compatibility.
      </span>
    </Callout>
  );
}
