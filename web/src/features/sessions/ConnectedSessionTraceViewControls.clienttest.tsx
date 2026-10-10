import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import { type Dialog as DesignSystemDialog } from "@/src/components/design-system/Dialog/Dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FilterState } from "@langfuse/shared";
import { ConnectedSessionTraceViewControls } from "./ConnectedSessionTraceViewControls";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  setViewId: vi.fn(),
  invalidate: vi.fn(),
  canWrite: true,
}));
const filters: FilterState = [
  { column: "rootName", type: "string", operator: "=", value: "agent" },
];

vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParam: () => [null, mocks.setViewId],
}));
vi.mock("@/src/features/rbac", () => ({
  useHasProjectAccess: ({ scope }: { scope: string }) =>
    scope === "TableViewPresets:read" || mocks.canWrite,
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      sessionViews: { list: { invalidate: mocks.invalidate } },
    }),
    sessionViews: {
      list: {
        useQuery: () => ({
          data: [{ id: "view", name: "Agents", filters }],
          isPending: false,
        }),
      },
      save: {
        useMutation: () => ({
          mutate: mocks.save,
          reset: vi.fn(),
          isPending: false,
        }),
      },
      delete: {
        useMutation: () => ({ mutate: mocks.remove, isPending: false }),
      },
    },
    sessions: {
      filterOptionsFromEvents: { useQuery: () => ({ data: { tags: [] } }) },
    },
  },
}));
vi.mock("@/src/features/filters", () => ({
  InlineFilterBuilder: ({
    onChange,
  }: {
    onChange: (filters: FilterState) => void;
  }) => <button onClick={() => onChange(filters)}>Edit draft</button>,
}));
vi.mock("@/src/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Dialog: Wrapper,
    DialogBody: Wrapper,
    DialogContent: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  };
});
vi.mock("@/src/components/design-system/Dialog/Dialog", () => {
  const Dialog = Object.assign(
    ({
      title,
      children,
      actions,
    }: ComponentProps<typeof DesignSystemDialog>) => (
      <div>
        <h2>{title}</h2>
        {children}
        {actions?.map((action) => (
          <button
            key={action.label}
            disabled={action.disabled || action.loading}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    ),
    { Body: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  );
  return { Dialog };
});

describe("session trace view controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canWrite = true;
  });

  it("applies filters only after confirmation", () => {
    const onChange = vi.fn();
    render(
      <ConnectedSessionTraceViewControls
        projectId="project"
        filters={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Filter traces"));
    fireEvent.click(screen.getByText("Edit draft"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Apply filters"));
    expect(onChange).toHaveBeenCalledWith(filters);
  });

  it("saves trace filters without table configuration", () => {
    render(
      <ConnectedSessionTraceViewControls
        projectId="project"
        filters={filters}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Filter traces (1)"));
    fireEvent.click(screen.getByText("Save as new view"));
    fireEvent.change(screen.getByLabelText("View name"), {
      target: { value: "Agents" },
    });
    fireEvent.click(screen.getByText("Save view"));
    expect(mocks.save).toHaveBeenCalledWith({
      projectId: "project",
      name: "Agents",
      filters,
    });
  });

  it("applies a saved view to the server filter state", () => {
    const onChange = vi.fn();
    render(
      <ConnectedSessionTraceViewControls
        projectId="project"
        filters={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Saved views"));
    fireEvent.click(screen.getByText("Agents"));
    expect(mocks.setViewId).toHaveBeenCalledWith("view");
    expect(onChange).toHaveBeenCalledWith(filters);
  });

  it("hides write actions for read-only users", () => {
    mocks.canWrite = false;
    render(
      <ConnectedSessionTraceViewControls
        projectId="project"
        filters={[]}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Filter traces"));
    expect(screen.queryByText("Save as new view")).not.toBeInTheDocument();
  });
});
