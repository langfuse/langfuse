import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DeleteOrganizationDialogController } from "./DeleteOrganizationDialogController";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  mutateAsync: vi.fn(async () => true),
  showSuccessToast: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { organizationId: "org-1" },
    push: async (url: string) => {
      mocks.calls.push(`push:${url}`);
      return true;
    },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: null,
    update: async () => {
      mocks.calls.push("session.update");
      return null;
    },
  }),
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useQueryOrganization: () => ({ id: "org-1", name: "Acme", projects: [] }),
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: () => true,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      delete: {
        useMutation: () => ({
          mutateAsync: mocks.mutateAsync,
          isPending: false,
        }),
      },
    },
  },
  reportNonTrpcError: vi.fn(),
}));

describe("DeleteOrganizationDialogController", () => {
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

  it("closes the dialog and navigates home with a refreshed session after deletion", async () => {
    render(
      <DeleteOrganizationDialogController>
        {({ openDialog }) => (
          <button type="button" onClick={openDialog}>
            Open
          </button>
        )}
      </DeleteOrganizationDialogController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByPlaceholderText("acme"), {
      target: { value: "acme" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Organization" }),
    );

    await waitFor(() =>
      expect(mocks.calls).toEqual(["session.update", "push:/"]),
    );
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ orgId: "org-1" });
    expect(mocks.showSuccessToast).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
