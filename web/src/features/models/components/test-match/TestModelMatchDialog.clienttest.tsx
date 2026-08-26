import { fireEvent, render, screen } from "@testing-library/react";

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    models: {
      testMatch: {
        useQuery: mockUseQuery,
      },
    },
  },
}));

import { TestModelMatchDialog } from "./TestModelMatchDialog";

const model = {
  id: "model-1",
  modelName: "ltx2",
  matchPattern: "(?i)^(ltx2)$",
  projectId: "project-1",
};

describe("TestModelMatchDialog", () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("shows a model match when the pattern hits and usage is empty", () => {
    mockUseQuery.mockReturnValue({
      data: {
        matched: true,
        model,
        matchedTier: null,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <TestModelMatchDialog
        projectId="project-1"
        open
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. gpt-4-turbo"), {
      target: { value: "ltx2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test Match" }));

    expect(screen.getByText("Model matched")).toBeInTheDocument();
    expect(screen.getByText("ltx2")).toBeInTheDocument();
    expect(screen.getByText("(?i)^(ltx2)$")).toBeInTheDocument();
    expect(screen.getByText(/No pricing tier matched/i)).toBeInTheDocument();
    expect(screen.queryByText("No Match Found")).not.toBeInTheDocument();
  });
});
