/** @jest-environment node */

jest.mock("dns", () => ({
  promises: {
    resolve4: jest.fn(),
    resolve6: jest.fn(),
  },
}));

import { promises as dns } from "dns";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const mockedResolve4 = jest.mocked(dns.resolve4);
const mockedResolve6 = jest.mocked(dns.resolve6);

describe("utilities.validateImgUrl", () => {
  const caller = appRouter.createCaller(
    createInnerTRPCContext({
      session: {
        expires: "1",
        user: {
          id: "user-1",
          organizations: [],
          featureFlags: {},
          admin: false,
        },
      } as any,
      headers: {},
    }),
  );

  beforeEach(() => {
    mockedResolve4.mockReset();
    mockedResolve6.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "image/png" : null,
      },
    }) as any;
  });

  it("should reject hostnames that resolve to an IPv6 unique local address", async () => {
    mockedResolve4.mockResolvedValue([]);
    mockedResolve6.mockResolvedValue(["fd12::1"]);

    await expect(
      caller.utilities.validateImgUrl(
        "https://ula-only.example.test/image.png",
      ),
    ).resolves.toEqual({ isValid: false });
  });

  it("should reject hostnames that resolve to an IPv4-mapped private IPv6 address", async () => {
    mockedResolve4.mockResolvedValue([]);
    mockedResolve6.mockResolvedValue(["::ffff:10.0.0.1"]);

    await expect(
      caller.utilities.validateImgUrl(
        "https://mapped-private.example.test/image.png",
      ),
    ).resolves.toEqual({ isValid: false });
  });
});
