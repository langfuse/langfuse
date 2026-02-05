import { Callout } from "@/src/components/ui/callout";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/router";
import { isLegacyEvalTarget } from "@/src/features/evals/utils/typeHelpers";

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
  const router = useRouter();
  const isDeprecated = isLegacyEvalTarget(targetObject);

  if (!isDeprecated) return null;

  return (
    <Callout
      id={`eval-remapping-peek-${evalConfigId}`}
      variant="info"
      key="dismissed-eval-remapping-callouts"
      actions={() => (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(
                `/project/${projectId}/evals/remap?evaluator=${evalConfigId}`,
              )
            }
            className="h-7 text-xs text-dark-blue hover:opacity-80"
          >
            Upgrade this evaluator
          </Button>
        </>
      )}
    >
      <span>This evaluator </span>
      <span className="text-dark-blue hover:opacity-80">
        <Link
          href="https://langfuse.com/faq/all/llm-as-a-judge-migration"
          target="_blank"
          rel="noopener noreferrer"
        >
          requires changes{" "}
        </Link>
      </span>
      <span>
        to benefit from new features and performance improvements. Upgrade for
        full compatibility.
      </span>
    </Callout>
  );
}
