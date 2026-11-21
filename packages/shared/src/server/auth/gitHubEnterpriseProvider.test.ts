import type { GithubProfile } from "next-auth/providers/github";
import type { UserinfoEndpointHandler } from "next-auth/providers/oauth";
import {
  createServer,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import { type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { GitHubEnterpriseProvider } from "./gitHubEnterpriseProvider";

// The same openid-client instance NextAuth hands to userinfo.request at sign-in.
const { Issuer } = createRequire(
  createRequire(__filename).resolve("next-auth"),
)("openid-client") as {
  Issuer: new (metadata: Record<string, string>) => {
    Client: new (metadata: Record<string, string>) => unknown;
  };
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r))),
  );
});

describe("GitHubEnterpriseProvider userinfo", () => {
  it("does not follow a redirect from the emails endpoint", async () => {
    const internal = await startServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify([{ email: "leak@internal", primary: true }]));
    });
    const ghe = await startFakeGitHubEnterprise((res) => {
      res.writeHead(302, { location: `${internal.url}/latest/meta-data/` });
      res.end();
    });

    const profile = await requestProfile(ghe.url);

    expect(internal.hits()).toBe(0);
    expect(profile.email).toBeFalsy();
  });

  it("fills in the primary email when the profile has none", async () => {
    const ghe = await startFakeGitHubEnterprise((res) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify([
          { email: "other@example.com", primary: false },
          { email: "primary@example.com", primary: true },
        ]),
      );
    });

    const profile = await requestProfile(ghe.url);

    expect(profile.email).toBe("primary@example.com");
  });
});

async function requestProfile(baseUrl: string): Promise<GithubProfile> {
  const provider = GitHubEnterpriseProvider({
    clientId: "client-id",
    clientSecret: "client-secret",
    enterprise: { baseUrl },
  });
  const userinfo = provider.userinfo as UserinfoEndpointHandler;
  const issuer = new Issuer({
    issuer: `${baseUrl}/login/oauth`,
    userinfo_endpoint: userinfo.url as string,
  });
  const client = new issuer.Client({
    client_id: "client-id",
    client_secret: "client-secret",
  });
  return (await userinfo.request!({
    client,
    tokens: { access_token: "token" },
    provider,
  } as unknown as Parameters<
    NonNullable<UserinfoEndpointHandler["request"]>
  >[0])) as GithubProfile;
}

async function startFakeGitHubEnterprise(
  emails: (res: ServerResponse) => void,
) {
  return startServer((req, res) => {
    if (req.url === "/api/v3/user/emails") return emails(res);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: 1, login: "octo", name: null, email: null }));
  });
}

async function startServer(handler: RequestListener) {
  let hits = 0;
  const server = createServer((req, res) => {
    hits++;
    handler(req, res);
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, hits: () => hits };
}
