import { describe, expect, it } from "vitest";

import { getGclidFromRequest } from "@/src/features/auth/lib/signupAttribution";

// The gclid is read from first-party cookies on .langfuse.com so that
// cloud_signup_complete events can be attributed to Google Ads clicks that
// landed on the langfuse.com marketing site. See signupAttribution.ts for
// the source priority.
describe("getGclidFromRequest", () => {
  const posthogCookieName = "ph_phc_someProjectApiKey123_posthog";

  it("returns undefined without any attribution cookies", () => {
    expect(getGclidFromRequest({ cookies: {} })).toBeUndefined();
  });

  it("reads the dedicated lf_gclid cookie", () => {
    expect(
      getGclidFromRequest({
        cookies: { lf_gclid: "Cj0KCQjw_test-123" },
      }),
    ).toBe("Cj0KCQjw_test-123");
  });

  it("prefers lf_gclid over _gcl_aw", () => {
    expect(
      getGclidFromRequest({
        cookies: {
          lf_gclid: "gclid-from-dedicated-cookie",
          _gcl_aw: "GCL.1700000000.gclid-from-google-cookie",
        },
      }),
    ).toBe("gclid-from-dedicated-cookie");
  });

  it("parses the gclid from Google's _gcl_aw linker cookie", () => {
    expect(
      getGclidFromRequest({
        cookies: { _gcl_aw: "GCL.1700000000.Cj0KCQjw_abcDEF-123" },
      }),
    ).toBe("Cj0KCQjw_abcDEF-123");
  });

  it("ignores a malformed _gcl_aw cookie", () => {
    expect(
      getGclidFromRequest({ cookies: { _gcl_aw: "not-the-format" } }),
    ).toBeUndefined();
  });

  it("falls back to the gclid in the PostHog first-touch URL", () => {
    const cookieValue = JSON.stringify({
      distinct_id: "some-id",
      $initial_person_info: {
        r: "https://www.google.com/",
        u: "https://langfuse.com/?utm_source=x&gclid=Cj0-initial-touch",
      },
    });
    expect(
      getGclidFromRequest({
        cookies: { [posthogCookieName]: cookieValue },
      }),
    ).toBe("Cj0-initial-touch");
  });

  it("returns undefined when the PostHog first-touch URL has no gclid", () => {
    const cookieValue = JSON.stringify({
      distinct_id: "some-id",
      $initial_person_info: { r: "", u: "https://langfuse.com/docs" },
    });
    expect(
      getGclidFromRequest({
        cookies: { [posthogCookieName]: cookieValue },
      }),
    ).toBeUndefined();
  });

  it("ignores a malformed PostHog cookie", () => {
    expect(
      getGclidFromRequest({
        cookies: { [posthogCookieName]: "%%%not-json" },
      }),
    ).toBeUndefined();
  });

  it("rejects values with unexpected characters or excessive length", () => {
    expect(
      getGclidFromRequest({
        cookies: { lf_gclid: '"><script>alert(1)</script>' },
      }),
    ).toBeUndefined();
    expect(
      getGclidFromRequest({
        cookies: { lf_gclid: "a".repeat(513) },
      }),
    ).toBeUndefined();
  });
});
