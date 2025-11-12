import { Card } from "@/src/components/ui/card";
import { SearchXIcon } from "lucide-react";

export const ObjectNotFoundCard = ({
  type,
}: {
  type: "TRACE" | "OBSERVATION" | "SESSION";
}) => (
  <Card className="flex h-full items-center justify-center p-6">
    <div className="text-center">
      <SearchXIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm capitalize text-muted-foreground">
        {type.toLowerCase()} not found. Likely deleted.
      </p>
    </div>
  </Card>
);
