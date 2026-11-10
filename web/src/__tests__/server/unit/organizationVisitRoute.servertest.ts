const mockEnv = vi.hoisted(() => ({
  env: {
    NEXTAUTH_URL: "https://us.cloud.langfuse.com",
    NEXTAUTH_COOKIE_DOMAIN: "langfuse.com",
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US",
    VERCEL: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

const { getServerAuthSessionMock } = vi.hoisted(() => ({
  getServerAuthSessionMock: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({
  getServerAuthSession: getServerAuthSessionMock,
}));

import handler from "@/src/pages/api/organization/[organizationId]/visit";
import { readOrganizationCookie } from "@/src/server/utils/cookies";
import { type NextApiRequest, type NextApiResponse } from "next";

const visit = async (organizationId: string) => {
  getServerAuthSessionMock.mockResolvedValue({
    user: { organizations: [{ id: "org-1", projects: [] }] },
  });
  const setHeader = vi.fn();
  const end = vi.fn();
  const status = vi.fn().mockReturnValue({ json: vi.fn(), end });
  const req = {
    method: "POST",
    query: { organizationId },
    headers: { host: "us.cloud.langfuse.com", "x-forwarded-proto": "https" },
  } as unknown as NextApiRequest;
  await handler(req, { setHeader, status } as unknown as NextApiResponse);
  return { setHeader, status };
};

describe("POST /api/organization/visit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records an organization the user belongs to", async () => {
    const { setHeader, status } = await visit("org-1");

    expect(status).toHaveBeenCalledWith(204);
    const [header, value] = setHeader.mock.calls[0];
    expect(header).toBe("Set-Cookie");
    const [nameValue] = (value as string).split(";");
    const [name, raw] = nameValue.split("=");
    expect(readOrganizationCookie({ [name]: decodeURIComponent(raw) })).toEqual(
      { origin: "https://us.cloud.langfuse.com", organizationId: "org-1" },
    );
  });

  it("ignores an organization the user does not belong to", async () => {
    const { setHeader, status } = await visit("org-other");

    expect(status).toHaveBeenCalledWith(204);
    expect(setHeader).not.toHaveBeenCalled();
  });
});
