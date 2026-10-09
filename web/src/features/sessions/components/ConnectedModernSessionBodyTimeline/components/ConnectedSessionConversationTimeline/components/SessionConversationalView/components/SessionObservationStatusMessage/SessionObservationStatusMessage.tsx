import { type ComponentProps } from "react";
import { StatusMessage } from "@/src/components/design-system/StatusMessage/StatusMessage";

export function SessionObservationStatusMessage({
  name,
  level,
  message,
}: {
  name: string;
} & Pick<ComponentProps<typeof StatusMessage>, "level" | "message">) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-muted-foreground text-xs font-medium wrap-break-word">
        {name}
      </div>
      <StatusMessage level={level} message={message} size="compact" />
    </div>
  );
}
