/**
 * The Prompt tab and Config tab used to render `prompt.prompt` / `prompt.config`
 * straight through the unvirtualized JSONView (react18-json-view) with no size
 * gate — the same freeze-on-mount bug already fixed for the trace IO views. A
 * chat prompt with large/many few-shot messages, or a big JSON-schema config,
 * would freeze the prompt detail page. These tests pin the branch selection:
 * an over-limit field renders the bounded fallback and never mounts JSONView,
 * while normal fields render exactly as before.
 */
import { render, screen } from "@testing-library/react";
import type * as CodeJsonViewerModule from "@/src/components/ui/CodeJsonViewer";
import { JSON_VIEW_RENDER_CHAR_LIMIT } from "@/src/features/traces/components/IOPreview/fns/jsonViewSizeGate";

// Local mirror of the two PromptType values this component branches on, so the
// test file never has to resolve the real (heavy) @langfuse/shared package.
// Hoisted so the vi.mock factory below (itself hoisted above imports) can see it.
const { PROMPT_TYPE } = vi.hoisted(() => ({
  PROMPT_TYPE: { Chat: "chat", Text: "text" } as const,
}));

// Minimal stand-in for the shared barrel: only the handful of exports
// prompt-detail.tsx actually uses. Keeps this test independent of building
// the full @langfuse/shared package.
vi.mock("@langfuse/shared", () => ({
  PromptType: PROMPT_TYPE,
  PRODUCTION_LABEL: "production",
  extractVariables: () => [],
  MUSTACHE_REGEX: /{{([^{}]*)}}/g,
  PromptDependencyRegex: /@@@langfusePrompt:(.*?)@@@/g,
  isValidVariableName: () => true,
  ChatMlArraySchema: {
    parse: (value: unknown) => {
      if (!Array.isArray(value)) throw new Error("not an array");
      for (const message of value) {
        if (
          !message ||
          typeof message !== "object" ||
          !("role" in message) ||
          !("content" in message)
        ) {
          throw new Error("invalid chat message");
        }
      }
      return value;
    },
  },
}));

// JSONView is the unvirtualized render path we must NOT reach for over-limit
// fields — mock it so its presence is observable by test id.
vi.mock("@/src/components/ui/CodeJsonViewer", async () => {
  const actual = await vi.importActual<typeof CodeJsonViewerModule>(
    "@/src/components/ui/CodeJsonViewer",
  );
  return {
    ...actual,
    JSONView: (props: { title?: string }) => (
      <div data-testid="json-view">{props.title}</div>
    ),
  };
});

let mockTabValue = "prompt";
vi.mock("use-query-params", () => ({
  NumberParam: {},
  StringParam: {},
  withDefault: (_param: unknown, def: unknown) => def,
  useQueryParam: (key: string) => {
    if (key === "tab") return [mockTabValue, vi.fn()];
    return [undefined, vi.fn()];
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: {},
    asPath: "/",
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project1",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => false,
}));

vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ isBetaEnabled: false }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/prompts/components/prompt-history", () => ({
  PromptHistoryNode: () => <div data-testid="prompt-history" />,
}));
vi.mock("@/src/features/prompts/components/SetPromptVersionLabels", () => ({
  SetPromptVersionLabels: (props: { title?: React.ReactNode }) => (
    <div data-testid="set-prompt-version-labels">{props.title}</div>
  ),
}));
vi.mock(
  "@/src/features/playground/page/components/JumpToPlaygroundButton",
  () => ({
    JumpToPlaygroundButton: () => <div data-testid="jump-to-playground" />,
  }),
);
vi.mock("@/src/features/comments/CommentDrawerButton", () => ({
  CommentDrawerButton: () => <div data-testid="comment-drawer-button" />,
}));
vi.mock("@/src/features/prompts/components/PromptVariableListPreview", () => ({
  PromptVariableListPreview: () => <div data-testid="prompt-variable-list" />,
}));
vi.mock("@/src/features/traces", () => ({
  ChatMessageList: () => <div data-testid="chat-message-list" />,
}));
vi.mock("@/src/features/navigate-detail-pages/DetailPageNav", () => ({
  DetailPageNav: () => <div data-testid="detail-page-nav" />,
}));
vi.mock("@/src/features/prompts/components/duplicate-prompt", () => ({
  DuplicatePromptButton: () => <div data-testid="duplicate-prompt-button" />,
}));
vi.mock("@/src/features/tag/components/TagPromptDetailsPopover", () => ({
  TagPromptDetailsPopover: () => <div data-testid="tag-prompt-popover" />,
}));
vi.mock("@/src/features/experiments/components/CreateExperimentsForm", () => ({
  CreateExperimentsForm: () => <div data-testid="create-experiments-form" />,
}));
vi.mock("@/src/features/prompts/components/delete-prompt-version", () => ({
  DeletePromptVersion: () => <div data-testid="delete-prompt-version" />,
}));
vi.mock("@/src/components/table/use-cases/observations", () => ({
  default: () => <div data-testid="legacy-generations" />,
}));
vi.mock("@/src/features/events/components/EventsTable", () => ({
  default: () => <div data-testid="events-table" />,
}));
// Page renders the full app chrome (breadcrumb, sidebar trigger, session-aware
// header) which pulls in a large tRPC/session surface irrelevant to the JSON
// gating under test — render just the children.
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page">{children}</div>
  ),
}));

const mockAllVersionsUseQuery = vi.fn();
const mockResolvePromptGraphUseQuery = vi.fn();
const mockFilterOptionsUseQuery = vi.fn();
vi.mock("@/src/utils/api", () => ({
  api: {
    prompts: {
      allVersions: {
        useQuery: (...args: unknown[]) => mockAllVersionsUseQuery(...args),
      },
      resolvePromptGraph: {
        useQuery: (...args: unknown[]) =>
          mockResolvePromptGraphUseQuery(...args),
      },
      filterOptions: {
        useQuery: (...args: unknown[]) => mockFilterOptionsUseQuery(...args),
      },
    },
    useUtils: () => ({
      datasets: {
        baseRunDataByDatasetId: { invalidate: vi.fn() },
        runsByDatasetId: { invalidate: vi.fn() },
      },
      prompts: { allVersions: { invalidate: vi.fn() } },
    }),
  },
}));

import { PromptDetail } from "./prompt-detail";

const basePrompt = {
  id: "prompt-1",
  projectId: "project1",
  name: "my-prompt",
  version: 1,
  labels: [],
  tags: [],
  commitMessage: null,
};

describe("PromptDetail JSON size gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvePromptGraphUseQuery.mockReturnValue({ data: undefined });
    mockFilterOptionsUseQuery.mockReturnValue({ data: { tags: [] } });
  });

  it("renders the fallback and NOT JSONView for an over-limit chat prompt body (Prompt tab)", () => {
    mockTabValue = "prompt";
    const hugePrompt = Array.from(
      { length: JSON_VIEW_RENDER_CHAR_LIMIT / 5 + 10 },
      () => ({ notARole: "x" }), // fails ChatMlArraySchema -> chatMessages stays null
    );
    mockAllVersionsUseQuery.mockReturnValue({
      data: {
        promptVersions: [
          { ...basePrompt, type: PROMPT_TYPE.Chat, prompt: hugePrompt },
        ],
        totalCount: 1,
        commentCounts: new Map(),
      },
    });

    render(<PromptDetail promptName="my-prompt" />);

    expect(
      screen.getByText(/too large to render in JSON view/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("json-view")).not.toBeInTheDocument();
  });

  it("renders JSONView (not the fallback) for a normal-size chat prompt body (Prompt tab)", () => {
    mockTabValue = "prompt";
    mockAllVersionsUseQuery.mockReturnValue({
      data: {
        promptVersions: [
          {
            ...basePrompt,
            type: PROMPT_TYPE.Chat,
            prompt: [{ notARole: "x" }],
          },
        ],
        totalCount: 1,
        commentCounts: new Map(),
      },
    });

    render(<PromptDetail promptName="my-prompt" />);

    expect(
      screen.queryByText(/too large to render in JSON view/i),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });

  it("renders the fallback and NOT JSONView for an over-limit config (Config tab)", () => {
    mockTabValue = "config";
    const hugeConfig = { blob: "x".repeat(JSON_VIEW_RENDER_CHAR_LIMIT + 1) };
    mockAllVersionsUseQuery.mockReturnValue({
      data: {
        promptVersions: [
          {
            ...basePrompt,
            type: PROMPT_TYPE.Text,
            prompt: "hello",
            config: hugeConfig,
          },
        ],
        totalCount: 1,
        commentCounts: new Map(),
      },
    });

    render(<PromptDetail promptName="my-prompt" />);

    expect(
      screen.getByText(/too large to render in JSON view/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("json-view")).not.toBeInTheDocument();
  });

  it("renders JSONView (not the fallback) for a normal-size config (Config tab)", () => {
    mockTabValue = "config";
    mockAllVersionsUseQuery.mockReturnValue({
      data: {
        promptVersions: [
          {
            ...basePrompt,
            type: PROMPT_TYPE.Text,
            prompt: "hello",
            config: { temperature: 0.7 },
          },
        ],
        totalCount: 1,
        commentCounts: new Map(),
      },
    });

    render(<PromptDetail promptName="my-prompt" />);

    expect(
      screen.queryByText(/too large to render in JSON view/i),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });
});
