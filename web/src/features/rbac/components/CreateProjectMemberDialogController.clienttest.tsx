import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { organizationMemberLimitMessage } from "@/src/features/entitlements/constants/organizationMemberLimitMessage";
import { CreateProjectMemberDialogController } from "@/src/features/rbac/components/CreateProjectMemberDialogController";
import {
  ALREADY_ORGANIZATION_MEMBER_MESSAGE,
  ALREADY_PROJECT_MEMBER_MESSAGE,
  ORGANIZATION_ROLE_TOO_HIGH_MESSAGE,
  PENDING_MEMBERSHIP_INVITE_MESSAGE,
  PROJECT_ROLE_TOO_HIGH_MESSAGE,
} from "@/src/features/rbac/constants/membershipErrorMessages";
import type * as ApiModule from "@/src/utils/api";

const { invite, captureExceptionMock, trpcErrorToastMock, gates } = vi.hoisted(
  () => ({
    invite: vi.fn(),
    captureExceptionMock: vi.fn(),
    trpcErrorToastMock: vi.fn(),
    gates: {
      orgAccess: true,
      projectAccess: true,
      projectRoles: true,
    },
  }),
);

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
  addBreadcrumb: vi.fn(),
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: trpcErrorToastMock,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: () => gates.orgAccess,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => gates.projectAccess,
}));

vi.mock("@/src/features/entitlements/hooks", () => ({
  useHasEntitlement: () => gates.projectRoles,
  useEntitlementLimit: () => false,
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => false,
}));

vi.mock("@/src/utils/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/src/utils/api");

  return {
    ...actual,
    api: {
      useUtils: () => ({ members: { invalidate: vi.fn() } }),
      members: {
        allFromOrg: { useQuery: () => ({ data: undefined }) },
        allInvitesFromOrg: { useQuery: () => ({ data: undefined }) },
        create: {
          useMutation: (options?: {
            onSuccess?: () => void;
            onError?: (error: unknown) => void;
          }) =>
            useMutation({
              mutationFn: () => invite(),
              onSuccess: options?.onSuccess,
              onError: options?.onError,
            }),
        },
      },
    },
  };
});

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

function fieldContainer(label: string) {
  const container = screen.getByText(label).closest("div");
  if (!container) throw new Error(`No field container for ${label}`);
  return container;
}

function renderInviteDialog() {
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

  return render(
    <QueryClientProvider client={client}>
      <LayerProvider>
        <CreateProjectMemberDialogController
          orgId="org-1"
          project={{ id: "project-1", name: "Support assistant" }}
        >
          {({ openDialog }) => (
            <button type="button" onClick={openDialog}>
              Add member
            </button>
          )}
        </CreateProjectMemberDialogController>
      </LayerProvider>
    </QueryClientProvider>,
  );
}

async function submitInvite() {
  fireEvent.click(screen.getByRole("button", { name: "Add member" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
    target: { value: "ada@example.com" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Grant access" }));
  return screen.findByText(
    /ada@example.com|already a member|pending membership|higher than your own|member limit|could not be added/i,
  );
}

describe("member invite errors", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    gates.orgAccess = true;
    gates.projectAccess = true;
    gates.projectRoles = true;
    invite.mockReset();
    captureExceptionMock.mockClear();
    trpcErrorToastMock.mockClear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    cleanup();
  });

  it.each([
    {
      code: "CONFLICT",
      httpStatus: 409,
      message: ALREADY_PROJECT_MEMBER_MESSAGE,
    },
    {
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: ALREADY_ORGANIZATION_MEMBER_MESSAGE,
    },
    {
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: PENDING_MEMBERSHIP_INVITE_MESSAGE,
    },
    {
      code: "BAD_REQUEST",
      httpStatus: 400,
      message: ALREADY_PROJECT_MEMBER_MESSAGE,
    },
  ])(
    "shows $message on the email field without a toast or Sentry event ($code)",
    async ({ code, httpStatus, message }) => {
      invite.mockRejectedValue(trpcServerError({ code, httpStatus, message }));
      renderInviteDialog();

      await submitInvite();

      expect(fieldContainer("Email")).toHaveTextContent(message);
      expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(trpcErrorToastMock).not.toHaveBeenCalled();
      expect(captureExceptionMock).not.toHaveBeenCalled();
    },
  );

  it("shows an organization role above your own on the organization role field", async () => {
    invite.mockRejectedValue(
      trpcServerError({
        code: "FORBIDDEN",
        httpStatus: 403,
        message: ORGANIZATION_ROLE_TOO_HIGH_MESSAGE,
      }),
    );
    renderInviteDialog();

    await submitInvite();

    expect(fieldContainer("Organization Role")).toHaveTextContent(
      ORGANIZATION_ROLE_TOO_HIGH_MESSAGE,
    );
    expect(
      screen.getByRole("combobox", { name: "Organization Role" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("combobox", { name: "Organization Role" }),
    ).toHaveAccessibleDescription(ORGANIZATION_ROLE_TOO_HIGH_MESSAGE);
    expect(screen.getByRole("textbox", { name: "Email" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("shows a project role above your own on the project role field", async () => {
    gates.orgAccess = false;
    invite.mockRejectedValue(
      trpcServerError({
        code: "FORBIDDEN",
        httpStatus: 403,
        message: PROJECT_ROLE_TOO_HIGH_MESSAGE,
      }),
    );
    renderInviteDialog();

    await submitInvite();

    expect(screen.queryByText("Organization Role")).not.toBeInTheDocument();
    expect(fieldContainer("Project Role")).toHaveTextContent(
      PROJECT_ROLE_TOO_HIGH_MESSAGE,
    );
    expect(
      screen.getByRole("combobox", { name: "Project Role" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("combobox", { name: "Project Role" }),
    ).toHaveAccessibleDescription(PROJECT_ROLE_TOO_HIGH_MESSAGE);
    expect(screen.getByRole("textbox", { name: "Email" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("shows the member seat limit as a form message", async () => {
    const message = organizationMemberLimitMessage(2, 2);
    invite.mockRejectedValue(
      trpcServerError({ code: "FORBIDDEN", httpStatus: 403, message }),
    );
    renderInviteDialog();

    await submitInvite();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("textbox", { name: "Email" })).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("still shows and captures an internal error without a toast", async () => {
    const message = "The member could not be added.";
    invite.mockRejectedValue(
      trpcServerError({
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        message,
      }),
    );
    renderInviteDialog();

    await submitInvite();

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(trpcErrorToastMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [, options] = captureExceptionMock.mock.calls[0]!;
    expect(options.tags).toMatchObject({
      area: "trpc",
      "trpc.code": "INTERNAL_SERVER_ERROR",
      "trpc.path": "members.create",
    });
  });
});
