import { useEffect } from "react";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import useSessionStorage from "@/src/components/useSessionStorage";
// import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { chartDefinitions } from "./chartDefinitions";

// NOTE - to be removed before pushing, moving to useChartSelectState.ts to simplify logic

export function ChartSelector(props: {
  // onChange?: (selected: string[]) => void;
  className?: string;
  projectId: string;
}) {
  const allChartKeys = chartDefinitions.map((chart) => chart.key);
  const [selectedDashboardChartKeys, setSelectedDashboardChartKeys] = useSessionStorage<string[]>(
    `selectedDashboardChartKeys-${props.projectId}`,
    allChartKeys,
  );

  // TODO: Update so 'Select All' is correctly selected when all charts are selected

  // useEffect(() => {
  //   props.onChange?.(selected);
  // }, [selected, onChange]);

  // Adding custom 'Select All' option to test (commenting out for now)
  // const selectAllOption = {
  //   value: "__select_all__",
  //   displayValue: "Select All",
  // };

  const options = [
    // selectAllOption,
    ...chartDefinitions.map((chart) => ({
      value: chart.key,
      displayValue: chart.label,
    })),
  ];

  const handleValueChange = (values: string[]) => {
    setSelectedDashboardChartKeys(values);
  };

  // Select all implementation idea (commenting out for now)

  // const handleValueChange = (values: string[]) => {
  //   // If "Select All" is selected
  //   if (values.includes("__select_all__")) {
  //     // If all are already selected, deselect all
  //     if (selected.length === allKeys.length) {
  //       setSelected([]);
  //     } else {
  //       setSelected(allKeys);
  //     }
  //   } else {
  //     setSelected(values);
  //   }
  // };

  // Show "Select All" as checked if all are selected
  // const valuesToShow = selected.length === allChartKeys.length ? allChartKeys : selected;

  return (
    <MultiSelect
      className={props.className}
      title="Charts"
      label="Charts"
      values={selectedDashboardChartKeys}
      onValueChange={handleValueChange}
      options={options}
    />
  );
}
