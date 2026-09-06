import { Badge } from "@/src/components/ui/badge";
import { useTranslations } from "next-intl";

export const PromptVariableListPreview = ({
  variables,
}: {
  variables: string[];
}) => {
  const t = useTranslations("coreDetails.prompts.form");
  if (variables.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-muted-foreground mb-2 text-sm">
        {t("variablesAvailable")}
      </p>
      <div className="flex min-h-6 flex-wrap gap-2">
        {variables.map((variable) => (
          <Badge key={variable} variant="outline">
            {variable}
          </Badge>
        ))}
      </div>
    </div>
  );
};
