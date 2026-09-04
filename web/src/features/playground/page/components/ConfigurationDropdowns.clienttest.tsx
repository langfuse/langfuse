import { fireEvent, render, screen } from "@testing-library/react";

import { ConfigurationDropdowns } from "./ConfigurationDropdowns";

vi.mock("../context", () => ({
  usePlaygroundContext: () => ({
    tools: [],
    structuredOutputSchema: null,
    promptVariables: [],
    messagePlaceholders: [],
    setTools: vi.fn(),
  }),
}));

vi.mock("../hooks/usePlaygroundWindowSize", () => ({
  usePlaygroundWindowSize: () => ({
    containerRef: { current: null },
    width: 640,
    isVeryCompact: false,
    isCompact: false,
  }),
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-id",
}));

vi.mock("@/src/utils/api", () => {
  const useMutation = () => ({ mutateAsync: vi.fn() });
  return {
    api: {
      llmTools: {
        getAll: { useQuery: () => ({ data: [] }) },
        create: { useMutation },
        update: { useMutation },
        delete: { useMutation },
      },
      llmSchemas: { getAll: { useQuery: () => ({ data: [] }) } },
      useUtils: () => ({ llmTools: { getAll: { invalidate: vi.fn() } } }),
    },
  };
});

// CodeMirror needs layout APIs jsdom does not provide, and the parameters
// editor is not what these tests are about.
vi.mock("@/src/components/editor", () => ({
  CodeMirrorEditor: () => <div data-testid="parameters-editor" />,
}));

// cmdk observes its list container; jsdom has no ResizeObserver.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const openToolsPopover = () => {
  fireEvent.click(screen.getByRole("button", { name: /tools/i }));
};

// Queried by text, not by role: an open modal dialog marks everything outside
// it aria-hidden, so a role query cannot tell a closed popover apart from one
// that is still mounted underneath the dialog.
const createToolAction = () => screen.queryByText("Create new tool");

const clickCreateTool = () => {
  const action = createToolAction()?.closest("button");
  if (!action) throw new Error("Create new tool action is not rendered");
  fireEvent.click(action);
};

describe("ConfigurationDropdowns tools overlay lifecycle", () => {
  it("closes the tools popover when the create tool dialog opens", () => {
    render(<ConfigurationDropdowns />);

    openToolsPopover();
    clickCreateTool();

    expect(screen.getByText("Create LLM Tool")).toBeInTheDocument();
    // The popover must not linger underneath the dialog.
    expect(createToolAction()).not.toBeInTheDocument();
  });

  it("reopens the tools popover when the dialog is cancelled", () => {
    render(<ConfigurationDropdowns />);

    openToolsPopover();
    clickCreateTool();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Create LLM Tool")).not.toBeInTheDocument();
    expect(createToolAction()).toBeInTheDocument();
  });
});
