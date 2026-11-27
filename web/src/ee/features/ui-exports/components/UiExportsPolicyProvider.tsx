import { type ReactNode } from "react";

import { UiExportsPolicyContext } from "@/src/ee/features/ui-exports/uiExportsPolicyContext";

export function UiExportsPolicyProvider({
  disabledReason,
  children,
}: {
  disabledReason: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <UiExportsPolicyContext.Provider value={disabledReason ?? null}>
      {children}
    </UiExportsPolicyContext.Provider>
  );
}
