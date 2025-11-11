import { Card } from "@/src/components/ui/card";

export const NotFoundCard = ({
  itemType,
  singleLine = false,
}: {
  itemType: "trace" | "observation";
  singleLine?: boolean;
}) => {
  if (singleLine) {
    return (
      <Card className="flex h-full w-full items-center justify-start overflow-hidden rounded-sm px-2">
        <p
          className="truncate text-xs text-muted-foreground"
          title={`The ${itemType} is either still being processed or has been deleted.`}
        >
          The {itemType} is either still being processed or has been deleted.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-sm p-3">
      <h2 className="mb-1.5 text-sm font-semibold">Not found</h2>
      <p className="max-w-xs text-center text-xs text-muted-foreground">
        The {itemType} is either still being processed or has been deleted.
      </p>
    </Card>
  );
};
