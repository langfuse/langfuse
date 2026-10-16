import { Button } from "@/src/components/design-system/Button/Button";

type OrganizationFeaturePreviewIntroProps = {
  canOpenPersonalPreviews: boolean;
  onOpenPersonalPreviews: () => void;
};

export function OrganizationFeaturePreviewIntro({
  canOpenPersonalPreviews,
  onOpenPersonalPreviews,
}: OrganizationFeaturePreviewIntroProps) {
  return (
    <div className="flex flex-col gap-1">
      {canOpenPersonalPreviews ? (
        <p className="text-muted-foreground text-sm">
          {[
            <Button
              key="personal-previews"
              variant="text"
              text="Enable feature previews for only you here"
              onClick={onOpenPersonalPreviews}
            />,
            ", the table below toggles it for the entire organization.",
          ]}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        Enable previews for everyone while they are using this organization. New
        members inherit these defaults automatically.
      </p>
    </div>
  );
}
