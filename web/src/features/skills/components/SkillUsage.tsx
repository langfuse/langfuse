import { type ReactNode, useState } from "react";
import { Callout } from "@/src/components/design-system/Callout/Callout";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { useSkillHasRecentUsage } from "@/src/features/skills/hooks/useSkillHasRecentUsage";
import { TraceSkillDialog } from "./TraceSkillDialog";

export function SkillUsage({
  projectId,
  name,
  version,
  children,
}: {
  projectId: string;
  name: string;
  version: number;
  children: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const hasRecentUsage = useSkillHasRecentUsage(projectId, name);
  const showSetup = !dismissed && hasRecentUsage === false;

  return (
    <DialogController
      renderDialog={() => <TraceSkillDialog skill={{ name, version }} />}
    >
      {({ openDialog }) => (
        <div className="flex min-h-0 flex-1 flex-col">
          {showSetup ? (
            <div className="shrink-0 px-4 pt-4">
              <Callout
                variant="info"
                align="top"
                onDismiss={() => setDismissed(true)}
                actions={[
                  {
                    type: "button",
                    label: "Quick Start",
                    onClick: openDialog,
                  },
                  {
                    type: "link",
                    label: "Documentation ↗",
                    href: "https://langfuse.com/docs/skill-management/tracing",
                  },
                ]}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-bold">
                    No traces linked to this skill in the last 14 days
                  </p>
                  <p>
                    Trace your agent&apos;s model and skill-loading tool calls
                    to see which skill versions were available and which files
                    it loaded. Installing a skill alone does not record usage.
                  </p>
                </div>
              </Callout>
            </div>
          ) : null}
          {children}
        </div>
      )}
    </DialogController>
  );
}
