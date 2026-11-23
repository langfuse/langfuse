import { createContext, type ReactNode, useContext, useState } from "react";
import { type ChartProps } from "@/src/features/widgets/chart-library/chart-props";

type ChartSync = NonNullable<ChartProps["sync"]>;
const DashboardChartSyncContext = createContext<ChartSync | undefined>(
  undefined,
);

export function DashboardChartSyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activeKey, setActiveKey] = useState<string>();
  return (
    <DashboardChartSyncContext.Provider
      value={{ activeKey, onActiveKeyChange: setActiveKey }}
    >
      {children}
    </DashboardChartSyncContext.Provider>
  );
}

export function useDashboardChartSync(): ChartSync {
  const shared = useContext(DashboardChartSyncContext);
  const [activeKey, setActiveKey] = useState<string>();
  return shared ?? { activeKey, onActiveKeyChange: setActiveKey };
}
