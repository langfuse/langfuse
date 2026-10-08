import { BadgeShell } from "@/src/components/design-system/Badge/Badge";

export const PromptVariableListPreview = ({
  variables,
}: {
  variables: string[];
}) => {
  return (
    <div>
      <p className="text-foreground-secondary mb-2 text-sm">
        The following variables are available:
      </p>
      <div className="flex min-h-6 flex-wrap gap-2">
        {variables.map((variable) => (
          <BadgeShell key={variable} font="mono" size="md">
            {variable}
          </BadgeShell>
        ))}
      </div>
    </div>
  );
};
