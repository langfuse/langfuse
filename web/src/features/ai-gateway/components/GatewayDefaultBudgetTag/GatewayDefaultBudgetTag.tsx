import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";
import { TagShell } from "@/src/components/design-system/Tag/Tag";

const descriptionBySubject = {
  key: "This key has no budget of its own, so the organization's default key budget applies. Set a budget on the key to replace it.",
  user: "This user has no budget of their own, so the organization's default user budget applies to all of their gateway keys. Set a budget for the user to replace it.",
} as const;

type GatewayDefaultBudgetTagProps = {
  subject: keyof typeof descriptionBySubject;
};

/** Marks a budget that comes from the organization's default rather than the key or user. */
export function GatewayDefaultBudgetTag({
  subject,
}: GatewayDefaultBudgetTagProps) {
  return (
    <CustomTooltip
      content={
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Default budget</span>
          <span className="text-muted-foreground text-xs">
            {descriptionBySubject[subject]}
          </span>
        </span>
      }
    >
      {({ getTriggerProps }) => (
        <span {...getTriggerProps()} tabIndex={0} className="inline-flex">
          {/* TagShell rather than Tag: Tag adds a native title, which would show a second tooltip. */}
          <TagShell>
            <span className="py-0.5">Default</span>
          </TagShell>
        </span>
      )}
    </CustomTooltip>
  );
}
