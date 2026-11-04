import { TriangleAlert } from "@langfuse/icons";

/**
 * How the mapped name is rendered: as a prompt template `{{variable}}`, or as
 * a state key for evaluators whose mapping builds a JSON object.
 */
export type VariableDisplay = "template" | "stateKey";

function VariableMappingCardHeaderContent({
  variable,
  variableDisplay = "template",
  mapping,
  isUnmapped,
  warningMessage,
}: {
  variable: string;
  variableDisplay?: VariableDisplay;
  mapping: React.ReactNode;
  isUnmapped: boolean;
  warningMessage?: string | null;
}) {
  return (
    <>
      <span className="text-primary-accent shrink-0 font-mono font-bold">
        {variableDisplay === "stateKey" ? variable : `{{${variable}}}`}
      </span>
      <span className="text-muted-foreground shrink-0">
        {variableDisplay === "stateKey" ? "from" : "maps to"}
      </span>
      {isUnmapped ? (
        <span className="text-dark-yellow flex min-w-0 items-center gap-1.5 font-bold">
          <TriangleAlert size="base" />
          <span>nothing yet</span>
        </span>
      ) : (
        <span className="@container flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0">{mapping}</span>
          {warningMessage ? (
            <span
              className="text-dark-yellow relative -top-px h-4 w-4 shrink-0 self-center"
              aria-label={`Warning: ${warningMessage}`}
              title={warningMessage}
            >
              <TriangleAlert size="base" aria-hidden="true" />
            </span>
          ) : null}
        </span>
      )}
    </>
  );
}

export { VariableMappingCardHeaderContent };
