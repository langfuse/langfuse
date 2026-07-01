import { useCallback } from "react";
import useSessionStorage from "@/src/components/useSessionStorage";

const CHARTS_ACCORDION_VALUE = "charts";

/**
 * Hook to manage the charts accordion collapsed state with session storage persistence.
 */
export function useExperimentChartsAccordion(projectId: string) {
  const [accordionValue, setAccordionValue] = useSessionStorage<
    string | undefined
  >(`experiment-charts-accordion-${projectId}`, CHARTS_ACCORDION_VALUE);

  const isChartsExpanded = accordionValue === CHARTS_ACCORDION_VALUE;

  const setChartsExpanded = useCallback(
    (expanded: boolean) => {
      setAccordionValue(expanded ? CHARTS_ACCORDION_VALUE : undefined);
    },
    [setAccordionValue],
  );

  return {
    isChartsExpanded,
    setChartsExpanded,
    // Raw accordion props for direct binding to Accordion component
    accordionValue,
    setAccordionValue,
  };
}
