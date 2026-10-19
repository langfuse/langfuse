import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import type { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";

import { UserFeaturePreviewsControl } from "./UserFeaturePreviewsPopover";
import { userFeaturePreviewFlags } from "../available-flags";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  showErrorToast: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
  mutate: vi.fn(),
  organizationDefaults: ["sessionViewV2", "sessionViewV2Timeline"] as string[],
  mutationOptions: undefined as
    | {
        onSuccess?: (
          result: unknown,
          variables: Record<string, unknown>,
        ) => void;
        onError?: (error: Error) => void;
      }
    | undefined,
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "actor" } },
    update: mocks.updateSession,
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: mocks.showErrorToast,
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/src/components/design-system/HoverCard/HoverCard", () => ({
  HoverCard: ({ children, content }: ComponentProps<typeof HoverCard>) => (
    <>
      {children({ getTriggerProps: () => ({}) })}
      {content}
    </>
  ),
}));

vi.mock("@/src/components/design-system/Switch/Switch", () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
  }: {
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (checked: boolean) => void;
    "aria-label": string;
    "aria-describedby"?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      members: { allFromOrg: { invalidate: mocks.invalidate } },
    }),
    members: {
      setUserFeaturePreviewEnabled: {
        useMutation: (options: typeof mocks.mutationOptions) => {
          mocks.mutationOptions = options;
          return { mutate: mocks.mutate, isPending: false };
        },
      },
    },
    organizations: {
      getFeatureFlagOrgDefaults: {
        useQuery: () => ({
          data: { defaults: mocks.organizationDefaults },
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const renderControl = (
  props: Omit<ComponentProps<typeof UserFeaturePreviewsControl>, "children">,
) =>
  render(
    <UserFeaturePreviewsControl {...props}>
      {({ enabledCount, totalCount, content }) => (
        <div>
          <button type="button">
            {enabledCount}/{totalCount} enabled
          </button>
          {content}
        </div>
      )}
    </UserFeaturePreviewsControl>,
  );

describe("UserFeaturePreviewsControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationDefaults = ["sessionViewV2", "sessionViewV2Timeline"];
    mocks.mutate.mockImplementation((variables) => {
      mocks.mutationOptions?.onSuccess?.({}, variables);
    });
  });

  it("blocks user changes when the organization disables a preview", () => {
    mocks.organizationDefaults = ["sessionViewV2"];
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        externalMediaStorage: false,
        skillManagement: false,
        sessionViewV2: true,
        sessionViewV2Timeline: false,
      },
      management: { allowed: true },
    });
    const timelineSwitch = screen.getByRole("checkbox", {
      name: "Toggle Session Timeline for user",
    });
    expect(timelineSwitch).toBeDisabled();
    expect(timelineSwitch).toHaveAccessibleDescription();
    expect(
      screen.getByRole("checkbox", {
        name: "Toggle Redesigned Session View for user",
      }),
    ).toBeEnabled();
  });

  it("explains why a multi-organization user cannot be changed", () => {
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        externalMediaStorage: false,
        skillManagement: false,
        sessionViewV2: false,
        sessionViewV2Timeline: false,
      },
      management: {
        allowed: false,
      },
    });

    expect(
      screen.getByRole("button", {
        // Derived: the counter's denominator is the number of user previews,
        // so a new preview must not fail this test.
        name: new RegExp(`0/${userFeaturePreviewFlags.length} enabled`, "i"),
      }),
    ).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAccessibleDescription();
  });

  it("updates an eligible user and captures metadata once after success", async () => {
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        externalMediaStorage: false,
        skillManagement: false,
        sessionViewV2: false,
        sessionViewV2Timeline: false,
      },
      management: { allowed: true },
    });

    expect(
      screen.queryByRole("checkbox", {
        name: "Toggle External Media Storage for user",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Redesigned Session View for user",
      }),
    );

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        orgId: "org-1",
        userId: "user-1",
        flag: "sessionViewV2",
        enabled: true,
      },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledTimes(1);
    });
    expect(mocks.capture).toHaveBeenCalledWith(
      "organization_settings:user_feature_flag_toggled",
      { feature: "sessionViewV2", isEnabled: true },
    );
  });

  it("keeps pending state isolated to the selected feature", () => {
    let settle: (() => void) | undefined;
    mocks.mutate.mockImplementation(
      (_variables, options: { onSettled: () => void }) => {
        settle = options.onSettled;
      },
    );
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        externalMediaStorage: false,
        skillManagement: false,
        sessionViewV2: false,
        sessionViewV2Timeline: false,
      },
      management: { allowed: true },
    });

    const sessions = screen.getByRole("checkbox", {
      name: "Toggle Redesigned Session View for user",
    });
    fireEvent.click(sessions);

    expect(sessions).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Toggle Session Timeline for user",
      }),
    ).toBeEnabled();
    expect(settle).toBeDefined();
    act(() => settle?.());
    expect(sessions).toBeEnabled();
  });

  it("notifies on failure, unlocks the control, and allows retry", async () => {
    mocks.mutate.mockImplementation((_variables, options) => {
      mocks.mutationOptions?.onError?.(new Error("denied"));
      options.onSettled();
    });
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        externalMediaStorage: false,
        skillManagement: false,
        sessionViewV2: false,
        sessionViewV2Timeline: false,
      },
      management: { allowed: true },
    });

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Redesigned Session View for user",
      }),
    );

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.showErrorToast).toHaveBeenCalledOnce());
    expect(mocks.capture).not.toHaveBeenCalled();
    const sessionSwitch = screen.getByRole("checkbox", {
      name: "Toggle Redesigned Session View for user",
    });
    expect(sessionSwitch).toBeEnabled();
    fireEvent.click(sessionSwitch);
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
});
