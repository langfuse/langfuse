import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import {
  V4MigrationWizardSidebarToggle,
  V4MigrationWizardToggle,
} from "./V4MigrationWizardToggle";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  mutate: vi.fn(),
  updateSession: vi.fn().mockResolvedValue(undefined),
  sessionEnabled: true,
  mutationOptions: undefined as
    | {
        onSuccess?: (result: {
          v4MigrationWizardEnabled: boolean;
        }) => void | Promise<void>;
        onError?: () => void;
      }
    | undefined,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { v4MigrationWizardEnabled: mocks.sessionEnabled },
    },
    update: mocks.updateSession,
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    userAccount: {
      setV4MigrationWizardEnabled: {
        useMutation: (options: typeof mocks.mutationOptions) => {
          mocks.mutationOptions = options;
          return { mutate: mocks.mutate, isPending: false };
        },
      },
    },
  },
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiFlag: () => true,
}));

vi.mock("@/src/components/ui/sidebar", () => ({
  SidebarMenuButton: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/src/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("lucide-react", () => ({
  SparklesIcon: () => null,
}));

vi.mock("@/src/components/design-system/Switch/Switch", () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label": string;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

vi.mock("@/src/components/design-system/Checkbox/Checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    "aria-label": ariaLabel,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label": string;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

vi.mock("@/src/components/ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="alertdialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  AlertDialogAction: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled: boolean;
    onClick: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

describe("V4MigrationWizardToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionEnabled = true;
    mocks.mutate.mockImplementation(({ enabled }) => {
      mocks.mutationOptions?.onSuccess?.({
        v4MigrationWizardEnabled: enabled,
      });
    });
  });

  it("requires confirmation that migration is complete before disabling", async () => {
    render(<V4MigrationWizardToggle source="panel" />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show migration wizard" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Turn off the migration wizard?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn off wizard" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/sidebar or in Account settings → v4 Migration/),
    ).toBeInTheDocument();
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:wizard_disable_confirmation_opened",
      { source: "panel" },
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I confirm that the v4 migration is complete",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Turn off wizard" }));

    expect(mocks.mutate).toHaveBeenCalledWith({ enabled: false });
    await waitFor(() => expect(mocks.updateSession).toHaveBeenCalledOnce());
    expect(mocks.capture).toHaveBeenCalledWith("v4_migration:wizard_toggled", {
      enabled: false,
      source: "panel",
    });
  });

  it("tracks cancellation without changing the preference", () => {
    render(<V4MigrationWizardToggle source="panel" />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show migration wizard" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep wizard on" }));

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:wizard_disable_confirmation_cancelled",
      { source: "panel" },
    );
  });

  it("tracks sidebar disable confirmation with the sidebar source", () => {
    render(<V4MigrationWizardSidebarToggle />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show migration wizard" }),
    );

    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:wizard_disable_confirmation_opened",
      { source: "sidebar" },
    );
  });

  it("re-enables immediately from migration settings", async () => {
    mocks.sessionEnabled = false;
    render(<V4MigrationWizardToggle source="settings" />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Show migration wizard" }),
    );

    expect(mocks.mutate).toHaveBeenCalledWith({ enabled: true });
    await waitFor(() => expect(mocks.updateSession).toHaveBeenCalledOnce());
    expect(mocks.capture).toHaveBeenCalledWith("v4_migration:wizard_toggled", {
      enabled: true,
      source: "settings",
    });
  });
});
