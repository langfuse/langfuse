import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  cloneElement,
  useState,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
  hasAccess: true,
  closeMenu: () => {},
}));

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenuController: ({
    children,
    renderMenu,
  }: {
    children: (control: {
      isOpen: boolean;
      Trigger: (props: {
        asChild?: boolean;
        children: ReactElement<{ onClick?: MouseEventHandler }>;
      }) => ReactNode;
    }) => ReactNode;
    renderMenu: () => ReactNode;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    mocks.closeMenu = () => setIsOpen(false);
    const Trigger = ({
      asChild,
      children: trigger,
    }: {
      asChild?: boolean;
      children: ReactElement<{ onClick?: MouseEventHandler }>;
    }) => {
      const onClick = () => setIsOpen(true);
      return asChild ? cloneElement(trigger, { onClick }) : trigger;
    };

    return (
      <>
        {children({ isOpen, Trigger })}
        {isOpen ? <div role="menu">{renderMenu()}</div> : null}
      </>
    );
  },
  DropdownMenuItem: ({
    allowPointerEventsWhenDisabled,
    children,
    disabled,
    onClick,
    onSelect,
    title,
  }: {
    allowPointerEventsWhenDisabled?: boolean;
    children: ReactNode;
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    onSelect?: (event: { preventDefault: () => void }) => void;
    title?: string;
  }) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      data-allow-pointer-events-when-disabled={
        allowPointerEventsWhenDisabled ? "true" : undefined
      }
      onClick={(event) => {
        if (disabled) return;
        onClick?.(event);
        const selectEvent = {
          defaultPrevented: false,
          preventDefault() {
            this.defaultPrevented = true;
          },
        };
        onSelect?.(selectEvent);
        if (!selectEvent.defaultPrevented) {
          mocks.closeMenu();
        }
      }}
    >
      {children}
    </button>
  ),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => mocks.hasAccess,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    asPath: "/",
    push: vi.fn(),
    query: { projectId: "proj-1" },
  }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ dashboard: { invalidate: vi.fn() } }),
    dashboard: {
      delete: {
        useMutation: () => ({
          mutateAsync: mocks.deleteDashboard,
          isPending: false,
        }),
      },
      cloneDashboard: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      updateDashboardMetadata: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
      allDashboards: {
        useQuery: () => ({ data: undefined }),
      },
    },
  },
}));

import { DashboardRowActions } from "./DashboardRowActions";

const projectDashboard = {
  id: "dash-1",
  name: "Support overview",
  description: "Daily support metrics",
  owner: "PROJECT" as const,
};

describe("DashboardRowActions", () => {
  beforeEach(() => {
    mocks.deleteDashboard.mockClear();
    mocks.hasAccess = true;
  });

  it("keeps the delete confirmation after the actions menu closes", async () => {
    render(
      <DashboardRowActions projectId="proj-1" dashboard={projectDashboard} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete dashboard/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /delete dashboard/i }));
    await waitFor(() => {
      expect(mocks.deleteDashboard).toHaveBeenCalledWith({
        dashboardId: "dash-1",
        projectId: "proj-1",
      });
    });
  });

  it("keeps the edit dialog after the actions menu closes", () => {
    render(
      <DashboardRowActions projectId="proj-1" dashboard={projectDashboard} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /edit/i }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: /edit dashboard/i }),
    ).toBeInTheDocument();
  });

  it("omits delete for Langfuse-owned dashboards", () => {
    render(
      <DashboardRowActions
        projectId="proj-1"
        dashboard={{ ...projectDashboard, owner: "LANGFUSE" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("menuitem", { name: /edit/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("exposes why disabled actions are blocked on hover", () => {
    mocks.hasAccess = false;
    render(
      <DashboardRowActions projectId="proj-1" dashboard={projectDashboard} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const edit = screen.getByRole("menuitem", { name: /edit/i });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute(
      "title",
      "You don't have permission to change this dashboard.",
    );
    expect(edit).toHaveAttribute(
      "data-allow-pointer-events-when-disabled",
      "true",
    );
  });
});
