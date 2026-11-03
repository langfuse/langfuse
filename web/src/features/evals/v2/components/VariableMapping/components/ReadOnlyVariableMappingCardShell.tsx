import {
  VariableMappingCardHeaderContent,
  type VariableDisplay,
} from "./VariableMappingCardHeaderContent";

/** Static card shell used when a saved mapping is displayed read-only. */
function ReadOnlyVariableMappingCardShell({
  variable,
  variableDisplay,
  mapping,
}: {
  variable: string;
  variableDisplay?: VariableDisplay;
  mapping: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground overflow-hidden rounded-md border">
      <div className="bg-secondary text-secondary-foreground flex min-h-9 min-w-0 items-center gap-2 px-3 py-1.5 text-sm">
        <VariableMappingCardHeaderContent
          variable={variable}
          variableDisplay={variableDisplay}
          mapping={mapping}
          isUnmapped={false}
        />
      </div>
    </div>
  );
}

export { ReadOnlyVariableMappingCardShell };
