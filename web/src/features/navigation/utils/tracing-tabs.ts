import useLocalStorage from "@/src/components/useLocalStorage";

export const TRACING_TABS = {
  TRACES: "traces",
  OBSERVATIONS: "observations",
  SESSIONS: "sessions",
} as const;

export type TracingTab = (typeof TRACING_TABS)[keyof typeof TRACING_TABS];

export const getTracingTabs = (projectId: string) => [
  {
    value: TRACING_TABS.TRACES,
    label: "Traces",
    href: `/project/${projectId}/traces`,
  },
  {
    value: TRACING_TABS.OBSERVATIONS,
    label: "Observations",
    href: `/project/${projectId}/observations`,
  },
  {
    value: TRACING_TABS.SESSIONS,
    label: "Sessions",
    href: `/project/${projectId}/sessions`,
  },
];

export const useTracingTabLocalStorage = () => {
  return useLocalStorage<TracingTab>("tracing-active-tab", TRACING_TABS.TRACES);
};
