import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { OrganizationFeaturePreviewsSettings } from "./OrganizationFeaturePreviewsSettings";
import { featurePreviewFlags } from "../available-flags";
import { getFeaturePreviewOptOutFlag } from "../utils";
import { getOrganizationFeaturePreviewDefaults } from "../fns/getOrganizationFeaturePreviewDefaults";

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
    sessionViewV2: false,
  } as Record<string, boolean>,
  /**
   * Which previews are already organization defaults. Per-test, because a test
   * that needs a preview which is NOT yet a default cannot rely on the registry
   * happening to hold one — both surviving previews are defaults by fixture.
   */
  orgDefaults: ["sessionViewV2"] as string[],
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      environment: {
        enableExperimentalFeatures: mocks.experimentalFeaturesEnabled,
      },
      user: {
        admin: false,
        featureFlags: mocks.userFeatureFlags,
        v4BetaEnabled: false,
      },
    },
    update: mocks.updateSession,
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: true,
  }),
}));

vi.mock(
  "@/src/features/feature-previews/components/ControlledFeaturePreviewModal",
  () => ({
    ControlledFeaturePreviewModal: () => null,
  }),
);

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
  AlertDialog: ({ children }: { children: ReactNode }) => children,
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
          data: {
            defaults: getOrganizationFeaturePreviewDefaults(mocks.orgDefaults),
            memberCount: 3,
          },
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
      sessionViewV2: false,
    };
    mocks.orgDefaults = ["sessionViewV2"];
    mocks.mutate.mockImplementation((variables) => {
      mocks.mutationOptions?.onSuccess?.({}, variables);
    });
  });

  it("keeps deployment-wide experimental previews enabled and locked", () => {
    mocks.experimentalFeaturesEnabled = true;

    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    const switches = screen.getAllByRole("checkbox", {
      name: /organization default/i,
    });
    // Derived, not hardcoded: the page renders one switch per registered
    // preview, so a new preview must not fail this test.
    expect(switches).toHaveLength(featurePreviewFlags.length);
    expect(
      screen.getByRole("checkbox", {
        name: "Toggle Session Timeline organization default",
      }),
    ).toBeInTheDocument();
    switches.forEach((featureSwitch) => {
      expect(featureSwitch).toBeChecked();
      expect(featureSwitch).toBeDisabled();
    });
  });

  it("shows session defaults as enabled and lets an admin disable them", () => {
    mocks.orgDefaults = [];
    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);
    const sessionSwitch = screen.getByRole("checkbox", {
      name: "Toggle Redesigned Session View organization default",
    });
    expect(sessionSwitch).toBeChecked();
    expect(sessionSwitch).toBeEnabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Toggle Session Timeline organization default",
      }),
    ).toBeChecked();
    fireEvent.click(sessionSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      orgId: "org-1",
      flag: "sessionViewV2",
      enabled: false,
    });
  });

  it("requires an admin to enable a preview personally before enabling the organization default", () => {
    // Not a default yet: an admin can always turn one OFF, so the lock only
    // shows on a row they would be turning ON.
    mocks.orgDefaults = [getFeaturePreviewOptOutFlag("sessionViewV2")];
    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    expect(
      screen.getByRole("checkbox", {
        name: "Toggle Redesigned Session View organization default",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Toggle External Media Storage organization default",
      }),
    ).toBeEnabled();
  });

  it("confirms an organization default change and captures metadata once", async () => {
    mocks.userFeatureFlags.sessionViewV2 = true;
    mocks.orgDefaults = [getFeaturePreviewOptOutFlag("sessionViewV2")];
    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Redesigned Session View organization default",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      orgId: "org-1",
      flag: "sessionViewV2",
      enabled: true,
    });
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    expect(mocks.capture).toHaveBeenCalledWith(
      "organization_settings:feature_flag_default_toggled",
      { feature: "sessionViewV2", isEnabled: true },
    );
  });

  it("does not capture analytics when a default change fails", () => {
    mocks.userFeatureFlags.sessionViewV2 = true;
    mocks.orgDefaults = [getFeaturePreviewOptOutFlag("sessionViewV2")];
    mocks.mutate.mockImplementation(() => {
      mocks.mutationOptions?.onError?.(new Error("denied"));
    });
    render(<OrganizationFeaturePreviewsSettings orgId="org-1" />);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Redesigned Session View organization default",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
