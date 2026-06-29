import { describe, it, expect, vi, beforeEach } from "vitest";

const envMock = vi.hoisted(() => ({
  env: { NEXTAUTH_URL: undefined as string | undefined },
}));
vi.mock("../../../env", () => envMock);

import { buildPermalink } from "./processor";

describe("buildPermalink", () => {
  beforeEach(() => {
    envMock.env.NEXTAUTH_URL = undefined;
  });

  it("returns undefined when NEXTAUTH_URL is unset (self-hosted)", () => {
    expect(buildPermalink("proj_01", "mon_01")).toBeUndefined();
  });

  it("returns an absolute URL when NEXTAUTH_URL is set", () => {
    envMock.env.NEXTAUTH_URL = "https://cloud.langfuse.com";
    expect(buildPermalink("proj_01", "mon_01")).toBe(
      "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
    );
  });
});
