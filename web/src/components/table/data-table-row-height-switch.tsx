import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import {
  MdDensityLarge,
  MdDensityMedium,
  MdDensitySmall,
} from "react-icons/md";

const heightOptions = [
  { id: "s", label: "Small", value: "h-6", icon: <MdDensitySmall /> },
  { id: "m", label: "Medium", value: "h-8", icon: <MdDensityMedium /> },
  { id: "l", label: "Large", value: "h-10", icon: <MdDensityLarge /> },
] as const;

type HeightId = (typeof heightOptions)[number]["id"];

export function useRowHeightLocalStorage(
  tableName: string,
  defaultValue: HeightId,
) {
  const [height, setHeight, clearHeight] = useLocalStorage<HeightId>(
    `${tableName}Height`,
    defaultValue,
  );

  return [height, setHeight, clearHeight];
}

export const DataTableRowHeightSwitch = ({
  rowHeight,
  setRowHeight,
}: {
  rowHeight: HeightId;
  setRowHeight: (e: HeightId) => void;
}) => (
  <Tabs
    //defaultValue={height}
    value={rowHeight}
    onValueChange={(e) => setRowHeight(e as any)}
    key="height"
  >
    <TabsList>
      {heightOptions.map(({ id, label, icon }) => (
        <TabsTrigger key={id} value={id}>
          <span role="img" aria-label={`${label} size`}>
            {icon}
          </span>
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
