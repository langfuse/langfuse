import { describe, expect, it } from "vitest";

import { getAdClickIdsFromRequest } from "@/src/features/auth/lib/signupAttribution";

// Click ids are read from first-party cookies on .langfuse.com so that
// cloud_signup_complete events can be attributed to ad clicks that landed on
// the langfuse.com marketing site. See signupAttribution.ts for the source
// priority per platform.
describe("getAdClickIdsFromRequest", () => {
  const posthogCookieName = "ph_phc_someProjectApiKey123_posthog";

  it("returns an empty object without any attribution cookies", () => {
    expect(getAdClickIdsFromRequest({ cookies: {} })).toEqual({});
  });

  it("reads the dedicated lf_* cookies for every platform", () => {
    expect(
      getAdClickIdsFromRequest({
        cookies: {
          lf_gclid: "Cj0KCQjw_google-123",
          lf_li_fat_id: "01fa-linkedin-uuid",
          lf_rdt_cid: "reddit_click_id",
          lf_twclid: "twitter-click-id",
        },
      }),
    ).toEqual({
      gclid: "Cj0KCQjw_google-123",
      li_fat_id: "01fa-linkedin-uuid",
      rdt_cid: "reddit_click_id",
      twclid: "twitter-click-id",
    });
  });

  it("omits ids that did not resolve so the result can be spread into event properties", () => {
    expect(
      getAdClickIdsFromRequest({ cookies: { lf_rdt_cid: "reddit-only" } }),
    ).toEqual({ rdt_cid: "reddit-only" });
  });

  it("prefers lf_gclid over Google's _gcl_aw linker cookie", () => {
    expect(
      getAdClickIdsFromRequest({
        cookies: {
          lf_gclid: "gclid-from-dedicated-cookie",
          _gcl_aw: "GCL.1700000000.gclid-from-google-cookie",
        },
      }).gclid,
    ).toBe("gclid-from-dedicated-cookie");
  });

  it("parses the gclid from Google's _gcl_aw linker cookie", () => {
    expect(
      getAdClickIdsFromRequest({
        cookies: { _gcl_aw: "GCL.1700000000.Cj0KCQjw_abcDEF-123" },
      }),
    ).toEqual({ gclid: "Cj0KCQjw_abcDEF-123" });
  });

  it("ignores a malformed _gcl_aw cookie", () => {
    expect(
      getAdClickIdsFromRequest({ cookies: { _gcl_aw: "not-the-format" } }),
    ).toEqual({});
  });

  it("reads the LinkedIn Insight Tag's li_fat_id cookie", () => {
    expect(
      getAdClickIdsFromRequest({
        cookies: { li_fat_id: "11abcdef-1234-5678-9abc-def012345678" },
      }),
    ).toEqual({ li_fat_id: "11abcdef-1234-5678-9abc-def012345678" });
  });

  it("reads the Reddit Pixel's _rdt_cid cookie", () => {
    expect(
      getAdClickIdsFromRequest({ cookies: { _rdt_cid: "t2_reddit.click_id" } }),
    ).toEqual({ rdt_cid: "t2_reddit.click_id" });
  });

  it("falls back to click-id params in the PostHog first-touch URL", () => {
    const cookieValue = JSON.stringify({
      distinct_id: "some-id",
      $initial_person_info: {
        r: "https://www.google.com/",
        u: "https://langfuse.com/?utm_source=x&gclid=Cj0-initial&li_fat_id=li-initial&rdt_cid=rdt-initial&twclid=tw-initial",
      },
    });
    expect(
      getAdClickIdsFromRequest({
        cookies: { [posthogCookieName]: cookieValue },
      }),
    ).toEqual({
      gclid: "Cj0-initial",
      li_fat_id: "li-initial",
      rdt_cid: "rdt-initial",
      twclid: "tw-initial",
    });
  });

  it("returns an empty object when the PostHog first-touch URL has no click ids", () => {
    const cookieValue = JSON.stringify({
      distinct_id: "some-id",
      $initial_person_info: { r: "", u: "https://langfuse.com/docs" },
    });
    expect(
      getAdClickIdsFromRequest({
        cookies: { [posthogCookieName]: cookieValue },
      }),
    ).toEqual({});
  });

  it("ignores a malformed PostHog cookie", () => {
    expect(
      getAdClickIdsFromRequest({
        cookies: { [posthogCookieName]: "%%%not-json" },
      }),
    ).toEqual({});
  });

  it("rejects values with unexpected characters or excessive length", () => {
    expect(
      getAdClickIdsFromRequest({
        cookies: {
          lf_gclid: '"><script>alert(1)</script>',
          lf_li_fat_id: "a".repeat(513),
        },
      }),
    ).toEqual({});
  });
});
