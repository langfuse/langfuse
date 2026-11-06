import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../env", () => ({ env: { LANGFUSE_LOG_LEVEL: "error" } }));

import { ClientCredentialsTokenSource, FileTokenSource } from "./auth";

const tokenResponse = (accessToken: string, expiresIn: number) =>
  new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("ClientCredentialsTokenSource", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("requests one token for concurrent callers and renews it before expiry", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("token-a", 3600))
      .mockResolvedValueOnce(tokenResponse("token-b", 3600));
    const source = new ClientCredentialsTokenSource({
      tokenUrl: "https://idp.example.com/oauth2/token",
      clientId: "langfuse",
      clientSecret: "s3cret:with/specials",
      authMethod: "client_secret_basic",
      scope: "clickhouse",
    });

    await Promise.all([source.initialize(), source.initialize()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(source.currentToken()).toBe("token-a");
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("langfuse:s3cret%3Awith%2Fspecials").toString("base64")}`,
    );
    expect(String(init?.body)).toBe(
      "grant_type=client_credentials&scope=clickhouse",
    );

    // Renewal runs five minutes before the token expires.
    await vi.advanceTimersByTimeAsync(55 * 60_000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(source.currentToken()).toBe("token-b");
    source.close();
  });
});

describe("FileTokenSource", () => {
  let dir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    dir = mkdtempSync(join(tmpdir(), "clickhouse-token-"));
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it("picks up a rotated token from the file", () => {
    const path = join(dir, "token");
    writeFileSync(path, "token-a\n");
    const source = new FileTokenSource(path);

    expect(source.currentToken()).toBe("token-a");

    writeFileSync(path, "token-b\n");
    vi.advanceTimersByTime(30_000);

    expect(source.currentToken()).toBe("token-b");
  });
});
