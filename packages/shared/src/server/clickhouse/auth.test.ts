import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(
  () => ({ LANGFUSE_LOG_LEVEL: "error" }) as Record<string, string>,
);
vi.mock("../../env", () => ({ env: mockEnv }));

import {
  ClientCredentialsTokenSource,
  FileTokenSource,
  TOKEN_FILE_RECHECK_MS,
  TOKEN_RENEWAL_MARGIN_SECONDS,
  initializeClickhouseAuth,
  resetClickhouseAuthForTests,
} from "./auth";

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

  it("leaves retries to the backoff while lookups keep arriving", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse("token-a", 600))
      .mockRejectedValue(new Error("connect ECONNREFUSED"));
    const source = new ClientCredentialsTokenSource({
      tokenUrl: "https://idp.example.com/oauth2/token",
      clientId: "langfuse",
      clientSecret: "s3cret",
      authMethod: "client_secret_post",
    });
    await source.initialize();

    // The renewal at half the token's life fails; the first retry is a second later.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    for (let lookup = 0; lookup < 5; lookup++) {
      expect(source.currentToken()).toBe("token-a");
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    source.close();
  });

  it("reads the client secret file again for every token request", async () => {
    const dir = mkdtempSync(join(tmpdir(), "clickhouse-client-secret-"));
    const path = join(dir, "client-secret");
    writeFileSync(path, "secret-a\n");
    fetchMock
      .mockResolvedValueOnce(tokenResponse("token-a", 3600))
      .mockResolvedValueOnce(tokenResponse("token-b", 3600));
    const source = new ClientCredentialsTokenSource({
      tokenUrl: "https://idp.example.com/oauth2/token",
      clientId: "langfuse",
      clientSecretFile: path,
      authMethod: "client_secret_post",
    });
    const sentSecret = (request: number) =>
      new URLSearchParams(String(fetchMock.mock.calls[request][1]?.body)).get(
        "client_secret",
      );

    await source.initialize();
    expect(sentSecret(0)).toBe("secret-a");

    // The platform replaces the secret while the first token is still valid.
    writeFileSync(path, "secret-b\n");
    await vi.advanceTimersByTimeAsync(
      (3600 - TOKEN_RENEWAL_MARGIN_SECONDS) * 1000,
    );

    expect(sentSecret(1)).toBe("secret-b");
    source.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("renews a token that outlives the longest timer delay only once that delay has passed", async () => {
    const thirtyDaysInSeconds = 30 * 24 * 3600;
    fetchMock.mockImplementation(async () =>
      tokenResponse("token-a", thirtyDaysInSeconds),
    );
    const source = new ClientCredentialsTokenSource({
      tokenUrl: "https://idp.example.com/oauth2/token",
      clientId: "langfuse",
      clientSecret: "s3cret",
      authMethod: "client_secret_post",
    });
    await source.initialize();

    // Node runs a timer with a delay above 2^31 - 1 ms after 1 ms.
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    source.close();
  });
});

describe("getClickhouseAuth", () => {
  const jwtEnv = {
    CLICKHOUSE_AUTH_MODE: "jwt",
    CLICKHOUSE_JWT_TOKEN_URL: "https://idp.example.com/oauth2/token",
    CLICKHOUSE_JWT_CLIENT_ID: "langfuse",
    CLICKHOUSE_JWT_CLIENT_SECRET: "s3cret",
    CLICKHOUSE_JWT_CLIENT_AUTH_METHOD: "client_secret_basic",
  };
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    Object.assign(mockEnv, jwtEnv);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    resetClickhouseAuthForTests();
    for (const key of Object.keys(jwtEnv)) delete mockEnv[key];
    vi.unstubAllGlobals();
  });

  it("serves the token obtained at startup to every copy of the module", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse("token-a", 3600));
    await initializeClickhouseAuth();

    // The web server loads this module once for its startup hook and again
    // for its route handlers.
    vi.resetModules();
    const routeHandlers = await import("./auth.js");

    expect(routeHandlers.getClickhouseAuth().config).toEqual({
      access_token: "token-a",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    vi.advanceTimersByTime(TOKEN_FILE_RECHECK_MS);

    expect(source.currentToken()).toBe("token-b");

    // A file caught halfway through a rewrite is empty.
    writeFileSync(path, "");
    vi.advanceTimersByTime(TOKEN_FILE_RECHECK_MS);

    expect(source.currentToken()).toBe("token-b");
    expect(() => new FileTokenSource(path).currentToken()).toThrow(
      "the file is empty",
    );

    // After a failed read the file is left alone until the next recheck.
    writeFileSync(path, "token-c\n");
    expect(source.currentToken()).toBe("token-b");
    vi.advanceTimersByTime(TOKEN_FILE_RECHECK_MS);
    expect(source.currentToken()).toBe("token-c");
  });
});
