import { Shapes } from "lucide-react";
import { HeaderActionMenuRow } from "@/src/components/HeaderActionMenuRow";

export function RegenerateTopicsMenuRow({
  disabledReason,
  onClick,
}: {
  disabledReason: string | null;
  onClick: () => void;
}) {
  return (
    <HeaderActionMenuRow
      label="Regenerate topics"
      icon={<Shapes className="icon-base text-icon-foreground" />}
      disabled={disabledReason !== null}
      disabledReason={disabledReason ?? undefined}
      onClick={onClick}
    />
  );
}
