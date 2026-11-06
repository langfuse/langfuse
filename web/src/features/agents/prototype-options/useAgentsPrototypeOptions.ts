import { StringParam, useQueryParams } from "use-query-params";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  DEFAULT_AGENT_OPTIONS,
  encodeAgentOptions,
  resolveAgentOptions,
  type AgentsPrototypeOptions,
} from "./options";

type Preferences = {
  projects: Record<string, AgentsPrototypeOptions>;
  save: (project: string, options: AgentsPrototypeOptions) => void;
};
const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      projects: {},
      save: (project, options) =>
        set((state) => ({
          projects: { ...state.projects, [project]: options },
        })),
    }),
    {
      name: "langfuse-agent-prototype-options-v1",
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return typeof window === "undefined"
              ? null
              : window.localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (key, value) => {
          try {
            if (typeof window !== "undefined")
              window.localStorage.setItem(key, value);
          } catch {
            /* Keep preferences usable without browser storage. */
          }
        },
        removeItem: (key) => {
          try {
            if (typeof window !== "undefined")
              window.localStorage.removeItem(key);
          } catch {
            /* The in-memory reset still applies. */
          }
        },
      })),
      partialize: (state) => ({ projects: state.projects }),
      merge: (persisted, current) => {
        const raw = (persisted as { projects?: unknown } | undefined)?.projects;
        const projects: Record<string, AgentsPrototypeOptions> = {};
        if (raw && typeof raw === "object")
          for (const [key, value] of Object.entries(raw).slice(0, 200)) {
            if (value && typeof value === "object") {
              const candidate = value as AgentsPrototypeOptions;
              projects[key] = resolveAgentOptions(
                encodeAgentOptions({
                  ...DEFAULT_AGENT_OPTIONS,
                  ...candidate,
                  cardMetrics: Array.isArray(candidate.cardMetrics)
                    ? candidate.cardMetrics
                    : DEFAULT_AGENT_OPTIONS.cardMetrics,
                }),
              );
            }
          }
        return { ...current, projects };
      },
    },
  ),
);
const params = {
  agentsView: StringParam,
  agentsActivity: StringParam,
  agentsRelation: StringParam,
  agentChart: StringParam,
  agentBaseline: StringParam,
  agentAttention: StringParam,
  agentBadges: StringParam,
  agentMetrics: StringParam,
};

export function useAgentsPrototypeOptions(projectId: string) {
  const defaults =
    usePreferences((state) => state.projects[projectId]) ??
    DEFAULT_AGENT_OPTIONS;
  const save = usePreferences((state) => state.save);
  const [query, setQuery] = useQueryParams(params);
  const options = resolveAgentOptions(query, defaults);
  const setOptions = (patch: Partial<AgentsPrototypeOptions>) => {
    const next = resolveAgentOptions(
      encodeAgentOptions({ ...options, ...patch }),
    );
    save(projectId, next);
    setQuery(encodeAgentOptions(next));
  };
  const resetOptions = () => {
    save(projectId, DEFAULT_AGENT_OPTIONS);
    setQuery(encodeAgentOptions(DEFAULT_AGENT_OPTIONS));
  };
  return { options, setOptions, resetOptions };
}
