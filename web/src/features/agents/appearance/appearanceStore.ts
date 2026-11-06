import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import {
  agentAppearanceKey,
  defaultAgentAppearance,
  parseAgentAppearance,
  type AgentAppearance,
} from "./appearance";

const storage: StateStorage = {
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
      /* Preferences remain available in memory when storage is unavailable. */
    }
  },
  removeItem: (key) => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
    } catch {
      /* Reset still applies to this mounted application. */
    }
  },
};

type AppearanceState = {
  overrides: Record<string, AgentAppearance>;
  set: (projectId: string, name: string, appearance: AgentAppearance) => void;
  reset: (projectId: string, name: string) => void;
};

export const useAgentAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      overrides: {},
      set: (projectId, name, appearance) => {
        const valid = parseAgentAppearance(appearance);
        if (valid)
          set((state) => ({
            overrides: {
              ...state.overrides,
              [agentAppearanceKey(projectId, name)]: valid,
            },
          }));
      },
      reset: (projectId, name) =>
        set((state) => {
          const overrides = { ...state.overrides };
          delete overrides[agentAppearanceKey(projectId, name)];
          return { overrides };
        }),
    }),
    {
      name: "langfuse-agent-appearance-v1",
      version: 1,
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({ overrides: state.overrides }),
      merge: (persisted, current) => {
        const raw = (persisted as { overrides?: unknown } | undefined)
          ?.overrides;
        const overrides: Record<string, AgentAppearance> = {};
        if (raw && typeof raw === "object") {
          for (const [key, value] of Object.entries(raw).slice(0, 2000)) {
            const appearance = parseAgentAppearance(value);
            if (appearance && key.length <= 1000) overrides[key] = appearance;
          }
        }
        return { ...current, overrides };
      },
    },
  ),
);

export function useAgentAppearance(
  projectId: string,
  agentName: string,
): AgentAppearance {
  const override = useAgentAppearanceStore(
    (state) => state.overrides[agentAppearanceKey(projectId, agentName)],
  );
  return override ?? defaultAgentAppearance(projectId, agentName);
}
