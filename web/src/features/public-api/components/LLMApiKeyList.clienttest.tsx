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
vi.mock("@/src/ee/features/ui-customization/useUiCustomization", () => ({
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
    existingKey: { provider: string };
    onSuccess: () => void;
  }) => (
    <>
      <output>{existingKey.provider}</output>
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
    fireEvent.click(screen.getByRole("row", { name: "Edit First connection" }));
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
    fireEvent.keyDown(
      screen.getByRole("row", { name: "Edit Second connection" }),
      { key: "Enter" },
    );
    expect(
      within(screen.getByRole("dialog")).getByText("Second"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "API key" })).toHaveValue("");
  });
});
