import { Card } from "@/src/components/ui/card";
import { SearchXIcon } from "@langfuse/icons";

export const ObjectNotFoundCard = ({
  type,
}: {
  type: "TRACE" | "OBSERVATION" | "SESSION";
}) => (
  <Card className="flex h-full w-full items-center justify-center border-none p-6">
    <div className="text-center">
      <SearchXIcon size="xl" color="muted" __rawClassName="mx-auto mb-2" />
      <p className="text-muted-foreground text-sm capitalize">
        {type.toLowerCase()} not found. Likely deleted.
      </p>
    </div>
  </Card>
);
