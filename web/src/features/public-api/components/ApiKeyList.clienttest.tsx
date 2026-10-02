import { render, screen } from "@testing-library/react";
import { type Role } from "@langfuse/shared/src/db";

const { projectApiKeys, mockSession } = vi.hoisted(() => ({
  projectApiKeys: [
    {
      id: "key-1",
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      expiresAt: null,
      lastUsedAt: null,
      note: "Production key",
      publicKey: "pk-lf-1234",
      displaySecretKey: "sk-lf-...5678",
      createdByUser: null,
      createdByApiKey: null,
    },
  ],
  mockSession: { data: null as unknown },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => mockSession,
}));

vi.mock("@/src/utils/api", () => {
  const noopMutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  return {
    api: {
      projectApiKeys: {
        byProjectId: {
          useQuery: (
            _input: unknown,
            options?: { enabled?: boolean },
          ): { data?: typeof projectApiKeys } =>
            options?.enabled ? { data: projectApiKeys } : {},
        },
        create: { useMutation: noopMutation },
        updateNote: { useMutation: noopMutation },
        delete: { useMutation: noopMutation },
      },
      organizationApiKeys: {
        byOrganizationId: { useQuery: () => ({}) },
        create: { useMutation: noopMutation },
        updateNote: { useMutation: noopMutation },
        delete: { useMutation: noopMutation },
      },
      useUtils: () => ({
        projectApiKeys: { invalidate: vi.fn() },
        organizationApiKeys: { invalidate: vi.fn() },
      }),
    },
    reportNonTrpcError: vi.fn(),
  };
});

vi.mock("@/src/features/public-api/hooks/useLangfuseEnvCode", () => ({
  useLangfuseEnvCode: () => 'LANGFUSE_PUBLIC_KEY="pk-lf-..."',
  useLangfuseBaseUrl: () => "http://localhost:3000",
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

import { ApiKeyList } from "./ApiKeyList";

const PROJECT_ID = "project-1";

function renderAsProjectRole(role: Role) {
  mockSession.data = {
    user: {
      admin: false,
      organizations: [{ id: "org-1", projects: [{ id: PROJECT_ID, role }] }],
    },
  };

  return render(<ApiKeyList entityId={PROJECT_ID} scope="project" />);
}

describe("ApiKeyList project access gating", () => {
  it("lists keys read-only for a MEMBER, who holds apiKeys:read but not apiKeys:CUD", () => {
    renderAsProjectRole("MEMBER");

    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
    expect(screen.getByTitle("pk-lf-1234")).toBeInTheDocument();
    expect(screen.getByText("sk-lf-...5678")).toBeInTheDocument();
    // Write controls stay behind apiKeys:CUD: no create button, and the note
    // renders as plain text instead of the click-to-edit affordance.
    expect(
      screen.queryByRole("button", { name: /create new api keys/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Production key")).toBeInTheDocument();
    expect(screen.queryByText("Click to add note")).not.toBeInTheDocument();
  });

  it("shows write controls for an ADMIN, who holds apiKeys:CUD", () => {
    renderAsProjectRole("ADMIN");

    expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
    expect(screen.getByTitle("pk-lf-1234")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create new api keys/i }),
    ).toBeInTheDocument();
  });

  it("denies access to a VIEWER, who holds neither api key scope", () => {
    renderAsProjectRole("VIEWER");

    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByTitle("pk-lf-1234")).not.toBeInTheDocument();
  });
});
