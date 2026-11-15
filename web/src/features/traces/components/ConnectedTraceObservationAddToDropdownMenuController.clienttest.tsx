// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "@langfuse/shared";

import type { DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import {
  getWindowIds,
  getWindowState,
  saveWindowIds,
  setWindowState,
} from "@/src/features/playground/page/storage/windowStorage";
import { ConnectedTraceObservationAddToDropdownMenuController } from "./ConnectedTraceObservationAddToDropdownMenuController";

const services = vi.hoisted(() => ({
  capture: vi.fn(),
  push: vi.fn(),
  getPrompt: vi.fn(),
  getVersions: vi.fn(),
  resolvePrompt: vi.fn(),
  showErrorToast: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project" },
    push: services.push,
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      prompts: {
        byId: { fetch: services.getPrompt },
        allVersions: { fetch: services.getVersions },
        resolvePromptGraph: { fetch: services.resolvePrompt },
      },
    }),
    llmApiKey: { effective: { useQuery: () => ({ data: { data: [] } }) } },
    datasets: {
      allDatasetMeta: { useQuery: () => ({ data: [], isLoading: false }) },
    },
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => services.capture,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => false,
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: services.showErrorToast,
}));

vi.mock("@/src/features/notifications/showToast", () => ({
  showToast: vi.fn(),
}));

vi.mock("@/src/utils/captureUnknownError", () => ({
  captureUnknownError: vi.fn(),
}));

vi.mock(
  "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController",
  () => ({
    NewDatasetItemFromExistingObjectDialogController: ({
      children,
    }: {
      children: (controls: { openDialog: () => void }) => ReactNode;
    }) => children({ openDialog: vi.fn() }),
  }),
);

vi.mock(
  "@/src/features/datasets/components/CreateDatasetDialogController",
  () => ({
    CreateDatasetDialogController: ({
      children,
    }: {
      children: (controls: {
        disabled: { reason: string };
        openDialog: () => void;
      }) => ReactNode;
    }) =>
      children({
        disabled: { reason: "Dataset access denied" },
        openDialog: vi.fn(),
      }),
  }),
);

vi.mock(
  "@/src/features/annotation-queues/components/AnnotationQueueSubmenuItemController",
  () => ({
    AnnotationQueueSubmenuItemController: ({
      children,
    }: {
      children: (controls: { item: DropdownMenuItemDefinition }) => ReactNode;
    }) =>
      children({
        item: {
          type: "item",
          id: "annotation-queue",
          title: "Annotation queue",
          onClick: vi.fn(),
        },
      }),
  }),
);

type Generation = NonNullable<
  ComponentProps<
    typeof ConnectedTraceObservationAddToDropdownMenuController
  >["generation"]
>;

const generation = {
  id: "generation",
  type: "GENERATION",
  promptId: "prompt-3",
  promptVersion: 3,
  input: JSON.stringify([
    { role: "user", content: "Explain structured logging" },
  ]),
  output: JSON.stringify([{ role: "assistant", content: "Recorded output" }]),
  metadata: JSON.stringify({
    promptVariables: { topic: "structured logging", unused: "not copied" },
  }),
} as Generation;

const prompt = (version: number): Prompt => ({
  id: `prompt-${version}`,
  name: "explain",
  version,
  projectId: "project",
  prompt: "Explain {{topic}}",
  type: "text",
  config: {},
  labels: [],
  tags: [],
  isActive: null,
  commitMessage: null,
  createdBy: "API",
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

describe("Generation header Playground presentation contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    services.getPrompt.mockResolvedValue(prompt(3));
    services.getVersions.mockResolvedValue({ promptVersions: [prompt(5)] });
    services.resolvePrompt.mockImplementation(
      async ({ promptId }: { promptId: string }) => ({
        resolvedPrompt:
          promptId === "prompt-3"
            ? "Explain {{topic}}"
            : "Explain {{topic}} in {{language}}",
      }),
    );
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens recorded and latest prompts from the real generation submenu", async () => {
    setWindowState("unrelated", { messages: [] });
    saveWindowIds(["unrelated"]);
    let items: DropdownMenuItemDefinition[] = [];
    const renderMenu = (preparedItems: DropdownMenuItemDefinition[]) => {
      items = preparedItems;
      return null;
    };
    const props = {
      projectId: "project",
      variant: "observation" as const,
      traceId: "trace",
      observationId: generation.id,
      input: null,
      output: null,
      metadata: generation.metadata,
      analyticsData: { source: "TraceDetail" as const, isV4: true },
      generation,
      renderMenu,
    };
    const { rerender } = render(
      <ConnectedTraceObservationAddToDropdownMenuController {...props} />,
    );
    const playground = () => {
      const item = items.find((item) => item.id === "playground");
      if (item?.type !== "submenu")
        throw new Error("Missing Playground submenu");
      return item;
    };
    const checkbox = (id: string) => {
      const item = playground().items.find((item) => item.id === id);
      if (item?.type !== "checkbox") throw new Error(`Missing ${id} control`);
      return item;
    };
    const action = (id: string) => {
      const item = playground().items.find((item) => item.id === id);
      if (item?.type !== "item") throw new Error(`Missing ${id} action`);
      return item;
    };
    const open = async (id: string) => act(async () => action(id).onClick?.());

    expect(items.find((item) => item.id === "dataset")).toMatchObject({
      disabled: {
        reason: "You don't have permission to add items to datasets.",
      },
    });
    expect(checkbox("recorded-prompt").title).toBe("Recorded prompt (v3)");
    expect(checkbox("compiled-messages").checked).toBe(true);

    act(() => checkbox("include-output").onCheckedChange(true));
    act(() => checkbox("recorded-prompt").onCheckedChange(true));
    expect(checkbox("recorded-prompt").checked).toBe(true);
    expect(checkbox("include-output")).toMatchObject({
      checked: false,
      disabled: { reason: expect.any(String) },
    });
    act(() => checkbox("compiled-messages").onCheckedChange(true));
    expect(checkbox("include-output").checked).toBe(true);
    act(() => checkbox("recorded-prompt").onCheckedChange(true));

    const pendingPrompt = Promise.withResolvers<Prompt | null>();
    services.getPrompt.mockReturnValueOnce(pendingPrompt.promise);
    let completion = Promise.resolve();
    act(() => {
      completion = Promise.resolve(action("existing-playground").onClick?.());
    });
    expect(playground().disabled?.reason).toBe("Loading prompt for replay");
    expect(checkbox("compiled-messages").disabled?.reason).toBe(
      "Loading prompt for replay",
    );
    await act(async () => {
      pendingPrompt.resolve(prompt(3));
      await completion;
    });
    const replayId = "playground-generation-generation";
    expect(getWindowState("unrelated")).not.toBeNull();
    expect(getWindowIds()).toEqual(["unrelated", replayId]);
    expect(getWindowState(replayId)).toMatchObject({
      messages: [{ content: "Explain {{topic}}" }],
      promptVariables: [
        { name: "topic", value: "structured logging", isUsed: true },
      ],
      sourcePrompt: { name: "explain", version: 3 },
    });
    expect(services.getVersions).not.toHaveBeenCalled();

    act(() => checkbox("latest-prompt").onCheckedChange(true));
    await open("fresh-playground");
    expect(getWindowIds()).toEqual([replayId]);
    expect(getWindowState(replayId)).toMatchObject({
      messages: [{ content: "Explain {{topic}} in {{language}}" }],
      promptVariables: [
        { name: "topic", value: "structured logging", isUsed: true },
        { name: "language", value: "", isUsed: true },
      ],
      sourcePrompt: { name: "explain", version: 5 },
    });
    expect(services.getVersions).toHaveBeenCalledWith({
      projectId: "project",
      name: "explain",
      limit: 1,
      page: 0,
    });
    expect(services.push).toHaveBeenCalledWith("/project/project/playground");
    expect(services.capture.mock.calls).toEqual([
      [
        "trace_detail:test_in_playground_button_click",
        {
          playgroundMode: "add_to_existing",
          inputSource: "recorded",
          variableCount: 2,
        },
      ],
      [
        "trace_detail:test_in_playground_button_click",
        { playgroundMode: "fresh", inputSource: "latest", variableCount: 2 },
      ],
    ]);

    const savedReplay = getWindowState(replayId);
    services.getPrompt.mockRejectedValueOnce(new Error("Prompt access failed"));
    await open("fresh-playground");
    expect(getWindowState(replayId)).toEqual(savedReplay);
    expect(services.push).toHaveBeenCalledTimes(2);
    expect(playground().disabled).toBeUndefined();
    expect(services.showErrorToast).toHaveBeenCalledWith(
      "Prompt replay failed",
      expect.any(String),
      expect.objectContaining({ operation: "playground.replay_prompt" }),
    );

    rerender(
      <ConnectedTraceObservationAddToDropdownMenuController
        {...props}
        generation={{ ...generation, metadata: null }}
      />,
    );
    expect(checkbox("recorded-prompt").disabled?.reason).toContain(
      "promptVariables",
    );
    expect(checkbox("latest-prompt").disabled?.reason).toContain(
      "promptVariables",
    );
    expect(checkbox("compiled-messages").checked).toBe(true);
    expect(checkbox("include-output").disabled).toBeUndefined();
  });
});
