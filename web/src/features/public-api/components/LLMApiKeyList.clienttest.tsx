import { fireEvent, render, screen, within } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { api } from "@/src/utils/api";
import { LlmApiKeyList } from "./LLMApiKeyList";

vi.mock("@/src/components/layouts/header", () => ({
  default: () => null,
}));
vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/ee/features/ui-customization", () => ({
  useUiCustomization: () => undefined,
}));
vi.mock("./CreateLLMApiKeyDialog", () => ({
  CreateLLMApiKeyDialog: () => null,
}));
vi.mock("./CreateLLMApiKeyForm", () => ({
  CreateLLMApiKeyForm: ({
    existingKey,
    onSuccess,
  }: {
    existingKey?: { provider: string };
    onSuccess: () => void;
  }) => (
    <>
      {existingKey && <output>{existingKey.provider}</output>}
      <input aria-label="API key" defaultValue="" />
      <button onClick={onSuccess}>Save connection</button>
    </>
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    llmApiKey: {
      all: { useQuery: vi.fn() },
      delete: { useMutation: () => ({ isPending: false }) },
    },
    useUtils: () => ({ llmApiKey: { invalidate: vi.fn() } }),
  },
  reportNonTrpcError: vi.fn(),
}));

describe("LLM connection editing", () => {
  it("preserves the dialog and draft across list updates, then opens a fresh form for another connection", () => {
    const keys = ["First", "Second"].map((provider) => ({
      id: provider,
      provider,
      adapter: "openai",
      baseURL: null,
      displaySecretKey: "sk-...test",
      extraHeaderKeys: [] as string[],
    }));
    const query = {
      data: { data: keys },
      isLoading: false,
      isError: false,
    };
    vi.mocked(api.llmApiKey.all.useQuery).mockReturnValue(
      query as ReturnType<typeof api.llmApiKey.all.useQuery>,
    );

    const { rerender } = render(<LlmApiKeyList projectId="project" />, {
      wrapper: LayerProvider,
    });
    fireEvent.click(screen.getByText("First").closest("tr")!);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(screen.getByRole("textbox", { name: "API key" }), {
      target: { value: "Unsaved draft" },
    });

    query.data = {
      data: keys.map((key) => ({ ...key, extraHeaderKeys: ["X-Test"] })),
    };
    rerender(<LlmApiKeyList projectId="project" />);

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("textbox", { name: "API key" })).toHaveValue(
      "Unsaved draft",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByText("Second").closest("tr")!, {
      key: "Enter",
    });
    expect(
      within(screen.getByRole("dialog")).getByText("Second"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "API key" })).toHaveValue("");
  });

  it("resets an unsaved create draft after dismissing the dialog", () => {
    vi.mocked(api.llmApiKey.all.useQuery).mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof api.llmApiKey.all.useQuery>);

    render(<LlmApiKeyList projectId="project" />, {
      wrapper: LayerProvider,
    });
    fireEvent.click(screen.getByRole("button", { name: "Add LLM Connection" }));
    fireEvent.change(screen.getByRole("textbox", { name: "API key" }), {
      target: { value: "Unsaved draft" },
    });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Add LLM Connection" }));

    expect(screen.getByRole("textbox", { name: "API key" })).toHaveValue("");
  });

  it("renders all connections without pagination", () => {
    const keys = Array.from({ length: 11 }, (_, index) => ({
      id: `${index}`,
      provider: `Provider ${index}`,
      adapter: "openai",
      baseURL: null,
      displaySecretKey: "sk-...test",
      extraHeaderKeys: [] as string[],
    }));
    vi.mocked(api.llmApiKey.all.useQuery).mockReturnValue({
      data: { data: keys },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof api.llmApiKey.all.useQuery>);

    render(<LlmApiKeyList projectId="project" />, {
      wrapper: LayerProvider,
    });

    expect(screen.getByText("Provider 0")).toBeInTheDocument();
    expect(screen.getByText("Provider 10")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Go to next page" }),
    ).not.toBeInTheDocument();
  });
});
