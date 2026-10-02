import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CustomTooltip } from "@/src/components/design-system/CustomTooltip/CustomTooltip";

export function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <CustomTooltip content={<>{children}</>} delay={300}>
      {({ getTriggerProps }) => (
        <InfoIcon
          {...getTriggerProps()}
          className="text-muted-foreground h-3.5 w-3.5 cursor-help"
          aria-label={label}
        />
      )}
    </CustomTooltip>
  );
}
