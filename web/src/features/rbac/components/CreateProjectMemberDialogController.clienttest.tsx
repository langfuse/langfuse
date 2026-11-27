import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Role } from "@langfuse/shared";
import { TRPCClientError } from "@trpc/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { CreateProjectMemberDialogController } from "@/src/features/rbac/components/CreateProjectMemberDialogController";
import type * as ApiModule from "@/src/utils/api";

const { invite, captureExceptionMock, trpcErrorToastMock } = vi.hoisted(() => ({
  invite: vi.fn(),
  captureExceptionMock: vi.fn(),
  trpcErrorToastMock: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: vi.fn(),
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: trpcErrorToastMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { organizations: [{ id: "org-1", name: "Acme" }] } },
  }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProjectOrOrganization: () => ({ organization: null, project: null }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const { hasOrganizationAccess } = vi.hoisted(() => ({
  hasOrganizationAccess: vi.fn(() => true),
}));
vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: hasOrganizationAccess,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => true,
  useEntitlementLimit: () => false,
  usePlan: () => "cloud:hobby",
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => false,
}));

vi.mock("@/src/utils/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/src/utils/api");
  const count = (totalCount: () => number) => ({
    useQuery: () => ({ data: { totalCount: totalCount() } }),
  });

  return {
    ...actual,
    api: {
      useUtils: () => ({
        members: { invalidate: vi.fn() },
      }),
      members: {
        allFromOrg: count(() => 1),
        allInvitesFromOrg: count(() => 0),
        create: {
          useMutation: (options?: {
            onSuccess?: () => void;
            onError?: (error: unknown) => void;
          }) =>
            useMutation({
              mutationFn: (input: unknown) => invite(input),
              onSuccess: options?.onSuccess,
              onError: options?.onError,
            }),
        },
      },
    },
  };
});

// jsdom has no layout; the email field scrolls its input into view.
Element.prototype.scrollIntoView = vi.fn();

const trpcServerError = (opts: {
  code: string;
  httpStatus: number;
  message: string;
}) =>
  TRPCClientError.from({
    error: {
      code: -32600,
      message: opts.message,
      data: {
        code: opts.code,
        httpStatus: opts.httpStatus,
        path: "members.create",
      },
    },
  });

function renderInviteDialog(defaultOrgRole?: Role) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: {
        retry: false,
        onError: (error) => {
          trpcErrorToastMock(error, "mutation.execute");
        },
      },
    },
  });

  render(
    <QueryClientProvider client={client}>
      <LayerProvider>
        <CreateProjectMemberDialogController
          target={{
            orgId: "org-1",
            project: { id: "project-1", name: "Support assistant" },
          }}
          surface="members_settings"
          defaultOrgRole={defaultOrgRole}
        >
          {({ openDialog }) => (
            <button type="button" onClick={openDialog}>
              Add members
            </button>
          )}
        </CreateProjectMemberDialogController>
      </LayerProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add members" }));
}

/** Types the addresses, each ended by a space so it becomes a chip. */
function addAddresses(...emails: string[]) {
  fireEvent.change(screen.getByRole("textbox", { name: "Email addresses" }), {
    target: { value: emails.map((email) => `${email} `).join("") },
  });
}

function sendInvites() {
  fireEvent.click(screen.getByRole("button", { name: "Send invites" }));
}

describe("member invite errors", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    invite.mockReset();
    captureExceptionMock.mockClear();
    trpcErrorToastMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    cleanup();
  });

  it("shows an existing member as its chip's reason, without an alert, a toast or a Sentry event", async () => {
    invite.mockResolvedValue({
      invited: [],
      added: [],
      addedToProject: [],
      failed: [{ email: "ada@example.com", reason: "already_member" }],
    });
    renderInviteDialog();
    addAddresses("ada@example.com");

    sendInvites();

    expect(await screen.findByText("(already a member)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("shows a refused request in an alert at the top, without a toast or a Sentry event", async () => {
    const message =
      "Forbidden, user does not have access to this resource or action";
    invite.mockRejectedValue(
      trpcServerError({ code: "FORBIDDEN", httpStatus: 403, message }),
    );
    renderInviteDialog();
    addAddresses("ada@example.com");

    sendInvites();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(
      screen.getByRole("textbox", { name: "Email addresses" }),
    ).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("shows and captures an internal error in an alert, without a toast", async () => {
    const message = "The members could not be invited.";
    invite.mockRejectedValue(
      trpcServerError({
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        message,
      }),
    );
    renderInviteDialog();
    addAddresses("ada@example.com");

    sendInvites();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags).toMatchObject({
      area: "trpc",
      "trpc.code": "INTERNAL_SERVER_ERROR",
      "trpc.path": "members.create",
    });
  });

  it("clears the alert when the next send goes through", async () => {
    invite
      .mockRejectedValueOnce(
        trpcServerError({
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          message: "The members could not be invited.",
        }),
      )
      .mockResolvedValueOnce({
        invited: [],
        added: [],
        addedToProject: [],
        failed: [{ email: "ada@example.com", reason: "pending_invite" }],
      });
    renderInviteDialog();
    addAddresses("ada@example.com");

    sendInvites();
    await screen.findByRole("alert");
    sendInvites();

    expect(await screen.findByText("(already invited)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the role the dialog opens with", () => {
  afterEach(() => {
    cleanup();
    hasOrganizationAccess.mockReturnValue(true);
    invite.mockReset();
  });

  it("is the project role for someone who can only invite to the project", async () => {
    hasOrganizationAccess.mockReturnValue(false);
    invite.mockResolvedValue({
      invited: ["ada@example.com"],
      added: [],
      addedToProject: [],
      failed: [],
    });
    renderInviteDialog("VIEWER");
    addAddresses("ada@example.com");

    sendInvites();

    await vi.waitFor(() =>
      expect(invite).toHaveBeenCalledWith(
        expect.objectContaining({ orgRole: "NONE", projectRole: "VIEWER" }),
      ),
    );
  });
});
