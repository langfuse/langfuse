import { useState } from "react";
import { ActionButton } from "@/src/components/ActionButton";
import { TestModelMatchDialog } from "./TestModelMatchDialog";
import { FlaskConical } from "lucide-react";
import { type ButtonProps } from "@/src/components/ui/button";
import { useTranslations } from "next-intl";

type TestModelMatchButtonProps = {
  projectId: string;
  variant?: ButtonProps["variant"];
};

export type { TestModelMatchButtonProps };

export function TestModelMatchButton({
  projectId,
  variant,
}: TestModelMatchButtonProps) {
  const t = useTranslations("settingsEnterprise.models.actions");
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton
        variant={variant ?? "secondary"}
        icon={<FlaskConical className="h-4 w-4" />}
        onClick={() => setOpen(true)}
        data-testid="test-model-match-button"
      >
        {t("test")}
      </ActionButton>

      <TestModelMatchDialog
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
