import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  MdDensityLarge,
  MdDensityMedium,
  MdDensitySmall,
} from "react-icons/md";

const heightOptions = [
  { id: "s", label: "Small", value: "h-6", icon: <MdDensitySmall /> },
  { id: "m", label: "Medium", value: "h-24", icon: <MdDensityMedium /> },
  { id: "l", label: "Large", value: "h-64", icon: <MdDensityLarge /> },
] as const;

export type RowHeight = (typeof heightOptions)[number]["id"];

export const getRowHeightTailwindClass = (rowHeight: RowHeight | undefined) =>
  heightOptions.find((h) => h.id === rowHeight)?.value;

export function useRowHeightLocalStorage(
  tableName: string,
  defaultValue: RowHeight,
) {
  const [rowHeight, setRowHeight, clearRowHeight] = useLocalStorage<RowHeight>(
    `${tableName}Height`,
    defaultValue,
  );

  return [rowHeight, setRowHeight, clearRowHeight] as const;
}

export const DataTableRowHeightSwitch = ({
  rowHeight,
  setRowHeight,
}: {
  rowHeight: RowHeight;
  setRowHeight: (e: RowHeight) => void;
}) => {
  const capture = usePostHogClientCapture();
  return (
    <Tabs
      //defaultValue={height}
      value={rowHeight}
      onValueChange={(e) => {
        capture("table:row_height_switch_select", {
          rowHeight: e,
        });
        setRowHeight(e as any);
      }}
      key="height"
    >
      <TabsList className="gap-1 border bg-transparent px-2">
        {heightOptions.map(({ id, label, icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="px-2 shadow-none data-[state=active]:bg-input data-[state=active]:ring-border"
          >
            <span role="img" aria-label={`${label} size`}>
              {icon}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
