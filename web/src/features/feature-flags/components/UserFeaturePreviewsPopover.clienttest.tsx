import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

import { UserFeaturePreviewsControl } from "./UserFeaturePreviewsPopover";
import { featurePreviewFlags } from "../available-flags";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  invalidate: vi.fn().mockResolvedValue(undefined),
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
  showErrorToast: vi.fn(),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/src/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
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
    mocks.mutate.mockImplementation((variables) => {
      mocks.mutationOptions?.onSuccess?.({}, variables);
    });
  });

  it("explains why a multi-organization user cannot be changed", () => {
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        modernSession: false,
      },
      management: {
        allowed: false,
      },
    });

    expect(
      screen.getByText(
        "You can only change this user's feature flags if you are an administrator in every organization they belong to.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        // Derived: the counter's denominator is the number of registered
        // previews, so a new preview must not fail this test.
        name: new RegExp(`0/${featurePreviewFlags.length} enabled`, "i"),
      }),
    ).toBeDisabled();
  });

  it("updates an eligible user and captures metadata once after success", async () => {
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        modernSession: false,
      },
      management: { allowed: true },
    });

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Compact Session View for user",
      }),
    );

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        orgId: "org-1",
        userId: "user-1",
        flag: "modernSession",
        enabled: true,
      },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
    await waitFor(() => {
      expect(mocks.capture).toHaveBeenCalledTimes(1);
    });
    expect(mocks.capture).toHaveBeenCalledWith(
      "organization_settings:user_feature_flag_toggled",
      { feature: "modernSession", isEnabled: true },
    );
  });

  it("keeps pending state isolated to the selected feature", () => {
    mocks.mutate.mockImplementation(() => undefined);
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        modernSession: false,
      },
      management: { allowed: true },
    });

    const sessions = screen.getByRole("checkbox", {
      name: "Toggle Compact Session View for user",
    });
    fireEvent.click(sessions);

    // Its own row only. The counterpart assertion — that every OTHER row stays
    // interactive — needs a second registered preview, which the registry does
    // not have between one preview reaching GA and the next one landing. Add it
    // back with the next preview; `isToggling` is per-flag, not per-list.
    expect(sessions).toBeDisabled();
  });

  it("refetches without capturing analytics when the mutation fails", async () => {
    mocks.mutate.mockImplementation((_variables, options) => {
      mocks.mutationOptions?.onError?.(new Error("denied"));
      options.onSettled();
    });
    renderControl({
      orgId: "org-1",
      userId: "user-1",
      featurePreviews: {
        modernSession: false,
      },
      management: { allowed: true },
    });

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Toggle Compact Session View for user",
      }),
    );

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
