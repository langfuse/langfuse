import { Badge } from "@/src/components/ui/badge";

/** Displays the evaluator execution type with consistent product wording. */
export function EvaluatorTypeBadge({
  type,
}: {
  type: "CODE" | "LLM_AS_JUDGE";
}) {
  return (
    <Badge variant="secondary" className="whitespace-nowrap">
      {type === "CODE" ? "Code" : "LLM as a judge"}
    </Badge>
  );
}
