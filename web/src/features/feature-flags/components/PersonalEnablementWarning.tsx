import { Button } from "@/src/components/design-system/Button/Button";

type PersonalEnablementWarningProps = {
  canOpenPersonalPreviews: boolean;
  onOpenPersonalPreviews: () => void;
};

export function PersonalEnablementWarning({
  canOpenPersonalPreviews,
  onOpenPersonalPreviews,
}: PersonalEnablementWarningProps) {
  if (!canOpenPersonalPreviews) {
    return (
      <p className="text-destructive text-xs">
        Enable this preview in your personal Feature Preview settings before
        enabling it for the organization.
      </p>
    );
  }

  return (
    <p className="text-destructive text-xs">
      Enable this preview in your{" "}
      <Button
        variant="text"
        size="sm"
        text="personal Feature Preview settings"
        onClick={onOpenPersonalPreviews}
      />{" "}
      before enabling it for the organization.
    </p>
  );
}
