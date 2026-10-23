import { render, screen, waitFor } from "@testing-library/react";

import { NewPromptForm } from "./index";

const mocks = vi.hoisted(() => ({
  connections: [
    {
      provider: "mock",
      adapter: "openai",
      customModels: ["mock-model-large", "mock-model-small"],
      withDefaultModels: false,
    },
  ],
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: {}, environment: {} },
    status: "authenticated",
    update: vi.fn(),
  }),
}));

vi.mock("next/router", () => ({
  default: { push: vi.fn() },
  useRouter: () => ({ query: {}, push: vi.fn() }),
}));

vi.mock("use-query-params", () => ({
  useQueryParam: (name: string) => [
    name === "loadPlaygroundCache" ? "true" : undefined,
    vi.fn(),
  ],
  StringParam: {},
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/public-api/components/CreateLLMApiKeyDialog", () => ({
  CreateLLMApiKeyDialog: () => null,
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({ default: () => "p1" }));

vi.mock("@/src/features/prompts/hooks/usePromptNameValidation", () => ({
  usePromptNameValidation: () => {},
}));

vi.mock("@/src/components/editor/CodeMirrorEditor", () => ({
  CodeMirrorEditor: ({ value }: { value: string }) => (
    <pre data-testid="config-json">{value}</pre>
  ),
}));

vi.mock("@/src/components/editor/PromptLinkingEditor", () => ({
  PromptLinkingEditor: () => null,
}));

vi.mock("./PromptChatMessages", () => ({ PromptChatMessages: () => null }));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({}),
    llmApiKey: {
      all: { useQuery: () => ({ data: { data: mocks.connections } }) },
    },
    prompts: {
      create: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      filterOptions: { useQuery: () => ({ data: { name: [] } }) },
    },
  },
  reportTrpcErrorWithoutToast: vi.fn(),
}));

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

const param = (value: unknown) => ({ value, enabled: true });

const savePlaygroundWindow = (modelParams: Record<string, unknown>) =>
  sessionStorage.setItem(
    "langfuse-playgroundCache",
    JSON.stringify({
      messages: [{ type: "user", role: "user", content: "hi", id: "m1" }],
      modelParams,
    }),
  );

const targetPrompt = (config: Record<string, unknown>) =>
  ({
    id: "prompt-1",
    name: "chat-target",
    version: 1,
    type: "chat",
    prompt: [{ type: "chatmessage", role: "user", content: "x" }],
    config,
    labels: [],
    tags: [],
    isActive: true,
  }) as never;

const renderedConfig = async () => {
  await waitFor(() =>
    expect(screen.getByTestId("config-json")).toBeInTheDocument(),
  );
  // Let any change the picker reports after mount land before reading.
  await new Promise((resolve) => setTimeout(resolve, 100));

  return JSON.parse(screen.getByTestId("config-json").textContent ?? "{}");
};

describe("NewPromptForm saving a playground window as a new version", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps a usable model when the playground switched away from the pinned one", async () => {
    savePlaygroundWindow({
      provider: param("mock"),
      model: param("mock-model-small"),
      adapter: param("openai"),
      max_tokens: param(512),
      temperature: { value: 0, enabled: false },
      maxTemperature: { value: 2, enabled: false },
    });

    render(
      <NewPromptForm
        initialPrompt={targetPrompt({
          provider: "mock",
          model: "mock-model-large",
          max_tokens: 256,
          owner: "growth-team",
        })}
      />,
    );

    expect(await renderedConfig()).toEqual({
      provider: "mock",
      model: "mock-model-small",
      max_tokens: 512,
      owner: "growth-team",
    });
  });
});
