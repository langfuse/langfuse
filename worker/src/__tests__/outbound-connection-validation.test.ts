import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../../packages/shared/src/server/logger";
import { fetchWithSecureRedirects } from "../../../packages/shared/src/server/outbound-url";

const strictWhitelist = { hosts: [], ips: [], ip_ranges: [] };

let server: Server | undefined;

afterEach(async () => {
  await closeServer();
  vi.restoreAllMocks();
});

describe("fetchWithSecureRedirects connection-time validation", () => {
  it("should reject DNS results that resolve to blocked IPs at connection time", async () => {
    const url = await startLocalhostServer();

    await expect(
      fetchWithSecureRedirects(url, {}, validationOptions()),
    ).rejects.toMatchObject({
      message: "fetch failed",
      cause: expect.objectContaining({
        message: "Blocked IP address detected",
      }),
    });
  });

  it("should use the caller log context for connection-time blocks when whitelists match", async () => {
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => undefined);

    await expect(
      fetchWithSecureRedirects(
        await startLocalhostServer(),
        {},
        validationOptions(strictWhitelist, "Webhook"),
      ),
    ).rejects.toMatchObject({ message: "fetch failed" });
    await closeServer();

    await expect(
      fetchWithSecureRedirects(
        await startLocalhostServer(),
        {},
        validationOptions(strictWhitelist, "Image URL"),
      ),
    ).rejects.toMatchObject({ message: "fetch failed" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Webhook validation blocked resolved IP address"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Image URL validation blocked resolved IP address",
      ),
    );
  });

  it("should propagate DNS lookup errors from connection-time validation", async () => {
    const hostname = `nonexistent-${crypto.randomUUID()}.invalid`;

    await expect(
      fetchWithSecureRedirects(
        `http://${hostname}`,
        {},
        validationOptions({ hosts: [hostname], ips: [], ip_ranges: [] }),
      ),
    ).rejects.toMatchObject({
      message: "fetch failed",
      cause: expect.objectContaining({ code: "ENOTFOUND" }),
    });
  });

  it("should preserve host whitelist behavior at connection time", async () => {
    const url = await startLocalhostServer();

    const result = await fetchWithSecureRedirects(
      url,
      {},
      validationOptions({ hosts: ["localhost"], ips: [], ip_ranges: [] }),
    );

    expect(result.response.status).toBe(200);
    await expect(result.response.text()).resolves.toBe("ok");
  });

  it("should preserve IP range whitelist behavior at connection time", async () => {
    const url = await startLocalhostServer();

    const result = await fetchWithSecureRedirects(
      url,
      {},
      validationOptions({
        hosts: [],
        ips: [],
        ip_ranges: ["127.0.0.0/8", "::1/128"],
      }),
    );

    expect(result.response.status).toBe(200);
    await expect(result.response.text()).resolves.toBe("ok");
  });
});

async function startLocalhostServer(): Promise<string> {
  server = createServer((_request, response) => {
    response.end("ok");
  });

  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));

  const address = server.address() as AddressInfo;
  return `http://localhost:${address.port}`;
}

async function closeServer(): Promise<void> {
  if (!server) return;

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
  server = undefined;
}

function validationOptions(whitelist = strictWhitelist, logContext?: string) {
  return {
    maxRedirects: 0,
    redirectValidation: {
      validateUrl: async () => undefined,
      whitelist,
      logContext,
    },
  };
}
