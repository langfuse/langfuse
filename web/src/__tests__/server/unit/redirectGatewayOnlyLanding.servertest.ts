import { type GetServerSidePropsContext } from "next";
import { type Session } from "next-auth";

import { redirectGatewayOnlyLanding } from "@/src/features/organizations/server/redirectGatewayOnlyLanding";
import { getServerAuthSession } from "@/src/server/auth";

vi.mock("@/src/server/auth", () => ({ getServerAuthSession: vi.fn() }));

describe("redirectGatewayOnlyLanding", () => {
  it("sends gateway-only members to their organization settings", async () => {
    mockSession([gatewayOrg({ aiGateway: true })]);

    expect(await landOn({ organizationId: "gateway-org" })).toEqual({
      redirect: {
        destination: "/organization/gateway-org/settings",
        permanent: false,
      },
    });
  });

  it("sends members whose only org is gateway-only to its settings", async () => {
    mockSession([gatewayOrg({ aiGateway: true })]);

    expect(await landOn({})).toEqual({
      redirect: {
        destination: "/organization/gateway-org/settings",
        permanent: false,
      },
    });
  });

  it("keeps gateway-only members on the page when the AI Gateway is off for their org", async () => {
    mockSession([gatewayOrg({ aiGateway: false })]);

    expect(await landOn({ organizationId: "gateway-org" })).toEqual({
      props: {},
    });
  });

  it("keeps members who can read the org settings on the page", async () => {
    mockSession([{ ...gatewayOrg({ aiGateway: true }), role: "MEMBER" }]);

    expect(await landOn({ organizationId: "gateway-org" })).toEqual({
      props: {},
    });
  });

  it("keeps users with several orgs on the overview", async () => {
    mockSession([
      gatewayOrg({ aiGateway: true }),
      { ...gatewayOrg({ aiGateway: true }), id: "other-org" },
    ]);

    expect(await landOn({})).toEqual({ props: {} });
  });
});

/** landOn runs the redirect for a request with the given query */
function landOn(query: Record<string, string>) {
  return redirectGatewayOnlyLanding({
    req: {},
    res: {},
    query,
  } as unknown as GetServerSidePropsContext);
}

/** mockSession signs in a user who belongs to the given orgs */
function mockSession(organizations: Organization[]) {
  vi.mocked(getServerAuthSession).mockResolvedValue({
    expires: "",
    user: { id: "user-1", admin: false, organizations },
  } as unknown as Session);
}

/** gatewayOrg is an org where the user holds the AI_GATEWAY role and sees no projects */
function gatewayOrg(featureFlags: { aiGateway: boolean }) {
  return {
    id: "gateway-org",
    name: "Gateway Org",
    role: "AI_GATEWAY",
    plan: "oss",
    projects: [],
    featureFlags,
  } as unknown as Organization;
}

type Organization = NonNullable<Session["user"]>["organizations"][number];
