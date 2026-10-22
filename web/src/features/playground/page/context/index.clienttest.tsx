import { type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatMessageRole,
  ChatMessageType,
  type PromptVariable,
} from "@langfuse/shared";
import {
  PlaygroundProvider,
  usePlaygroundContext,
} from "@/src/features/playground/page/context";
import { getCacheKey } from "@/src/features/playground/page/storage/keys";
import { type PlaygroundCache } from "@/src/features/playground/page/types";

vi.mock("@/src/utils/api", () => ({
  api: {
    llmApiKey: { effective: { useQuery: () => ({ data: undefined }) } },
  },
}));

vi.mock("@/src/features/posthog-analytics", () => {
  const capture = vi.fn();
  return { usePostHogClientCapture: () => capture };
});

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "test-project",
}));

vi.mock("@/src/components/ChatMessages/MessageSearch", () => ({
  useSyncMessageSearchMessages: vi.fn(),
}));

vi.mock("@/src/features/notifications", () => ({
  showErrorToast: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));

function cacheVariables(windowId: string, promptVariables: PromptVariable[]) {
  const cache: PlaygroundCache = {
    messages: [
      {
        type: ChatMessageType.User,
        role: ChatMessageRole.User,
        content: promptVariables
          .filter((variable) => variable.isUsed)
          .map((variable) => `{{${variable.name}}}`)
          .join(" "),
      },
    ],
    promptVariables,
  };
  sessionStorage.setItem(getCacheKey(windowId), JSON.stringify(cache));
}

function renderPlayground(windowId: string) {
  return renderHook(usePlaygroundContext, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <PlaygroundProvider windowId={windowId}>{children}</PlaygroundProvider>
    ),
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(cleanup);

describe("PlaygroundProvider bulk variable updates", () => {
  it("updates provided own values while preserving other values, order, and usage", async () => {
    const variables: PromptVariable[] = [
      { name: "topic", value: "previous topic", isUsed: true },
      { name: "context", value: "previous context", isUsed: true },
      { name: "kept", value: "keep me", isUsed: true },
      { name: "retired", value: "kept for later", isUsed: false },
      { name: "inherited", value: "keep inherited", isUsed: true },
    ];
    cacheVariables("first", variables);
    const { result } = renderPlayground("first");
    await waitFor(() =>
      expect(result.current.promptVariables).toEqual(variables),
    );

    const values = {
      topic: "",
      context: "first line\nsecond line",
      retired: "updated for later",
      unknown: "must not create a variable",
    };
    Object.setPrototypeOf(values, { inherited: "must not overwrite" });

    act(() => result.current.updatePromptVariableValues(values));

    expect(result.current.promptVariables).toEqual([
      { name: "topic", value: "", isUsed: true },
      { name: "context", value: "first line\nsecond line", isUsed: true },
      { name: "kept", value: "keep me", isUsed: true },
      { name: "retired", value: "updated for later", isUsed: false },
      { name: "inherited", value: "keep inherited", isUsed: true },
    ]);
  });

  it("isolates updates and their persisted values to the active window", async () => {
    const variables: PromptVariable[] = [
      { name: "topic", value: "original", isUsed: true },
    ];
    cacheVariables("first", variables);
    cacheVariables("second", variables);
    const first = renderPlayground("first");
    const second = renderPlayground("second");
    await waitFor(() => {
      expect(first.result.current.promptVariables).toEqual(variables);
      expect(second.result.current.promptVariables).toEqual(variables);
    });

    act(() =>
      first.result.current.updatePromptVariableValues({ topic: "new" }),
    );

    expect(first.result.current.promptVariables).toEqual([
      { name: "topic", value: "new", isUsed: true },
    ]);
    expect(second.result.current.promptVariables).toEqual(variables);
    first.unmount();
    second.unmount();

    const restoredFirst = renderPlayground("first");
    const restoredSecond = renderPlayground("second");
    await waitFor(() => {
      expect(restoredFirst.result.current.promptVariables).toEqual([
        { name: "topic", value: "new", isUsed: true },
      ]);
      expect(restoredSecond.result.current.promptVariables).toEqual(variables);
    });
  });
});
