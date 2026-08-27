import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { OrganizationFeaturePreviewsSettings } from "./OrganizationFeaturePreviewsSettings";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  invalidateDefaults: vi.fn().mockResolvedValue(undefined),
  invalidateMembers: vi.fn().mockResolvedValue(undefined),
  mutate: vi.fn(),
  mutationOptions: undefined as
    | {
        onSuccess?: (
          result: unknown,
          variables: Record<string, unknown>,
        ) => void;
        onError?: (error: Error) => void;
      }
    | undefined,
  experimentalFeaturesEnabled: false,
  userFeatureFlags: {
    modernSession: false,
    compactTimeline: false,
  },
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      environment: {
        enableExperimentalFeatures: mocks.experimentalFeaturesEnabled,
      },
      user: { featureFlags: mocks.userFeatureFlags },
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

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
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
      aria-label={ariaLabel}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

vi.mock("@/src/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      organizations: {
        getFeatureFlagOrgDefaults: { invalidate: mocks.invalidateDefaults },
      },
      members: { allFromOrg: { invalidate: mocks.invalidateMembers } },
    }),
    organizations: {
      getFeatureFlagOrgDefaults: {
        useQuery: () => ({
          data: { defaults: ["modernSession"], memberCount: 3 },
          isError: false,
          isPending: false,
        }),
      },
      setFeatureFlagOrgDefault: {
        useMutation: (options: typeof mocks.mutationOptions) => {
          mocks.mutationOptions = options;
          return { mutate: mocks.mutate, isPending: false };
        },
      },
    },
  },
}));

describe("OrganizationFeaturePreviewsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.experimentalFeaturesEnabled = false;
    mocks.userFeatureFlags = {
      modernSession: false,
      compactTimeline: false,
    };
    mocks.mutate.mockImplementation((variables) => {
      mocks.mutationOptions?.onSuccess?.({}, variables);
    });
  });

  it("explains the deployment-wide experimental feature override", () => {
    mocks.experimentalFeaturesEnabled = true;

    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    expect(
      screen.getByText(/experimental features enabled deployment-wide/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Every preview on this page is enabled by the env variable LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true. Per-user opt-outs do not disable these previews.",
      ),
    ).toBeInTheDocument();
    const switches = screen.getAllByRole("checkbox", {
      name: /organization default/i,
    });
    expect(switches).toHaveLength(2);
    switches.forEach((featureSwitch) => {
      expect(featureSwitch).toBeChecked();
      expect(featureSwitch).toBeDisabled();
    });
  });

  it("requires an admin to enable a preview personally before enabling the organization default", () => {
    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    expect(
      screen.getByRole("checkbox", {
        name: "Toggle Compact Timeline organization default",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Toggle Compact Session View organization default",
      }),
    ).not.toBeDisabled();
    const personalEnablementRequirements = screen.getAllByText(
      /enable this preview in your personal feature preview settings/i,
    );
    personalEnablementRequirements.forEach((requirement) =>
      expect(requirement).toHaveClass("text-destructive"),
    );
  });

  it("confirms an organization default change and captures metadata once", async () => {
    mocks.userFeatureFlags.compactTimeline = true;
    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    expect(
      screen.getByText(/new members inherit these defaults automatically/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Compact Timeline organization default",
      }),
    );
    expect(screen.getByText("Already enabled for you")).toBeInTheDocument();
    expect(
      screen.getByText(/personal Feature Preview settings.*tested/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      orgId: "org-1",
      flag: "compactTimeline",
      enabled: true,
    });
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    expect(mocks.capture).toHaveBeenCalledWith(
      "organization_settings:feature_flag_default_toggled",
      { feature: "compactTimeline", isEnabled: true },
    );
  });

  it("does not capture analytics when a default change fails", () => {
    mocks.userFeatureFlags.compactTimeline = true;
    mocks.mutate.mockImplementation(() => {
      mocks.mutationOptions?.onError?.(new Error("denied"));
    });
    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Compact Timeline organization default",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
