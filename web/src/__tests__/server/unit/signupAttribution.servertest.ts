import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import nextConfig from "@/next.config.mjs";
import { env } from "@/src/env.mjs";
import {
  getAdClickIdsFromRequest,
  getSignupAttributionFromRequest,
  getSignupSourceFromRequest,
  LOCALES,
} from "@/src/features/auth/lib/signupAttribution";

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
          lf_gbraid: "0AAAAAD-ios-app-click",
          lf_wbraid: "CjkKCQ-ios-web-click",
          lf_li_fat_id: "01fa-linkedin-uuid",
          lf_rdt_cid: "reddit_click_id",
          lf_twclid: "twitter-click-id",
        },
      }),
    ).toEqual({
      gclid: "Cj0KCQjw_google-123",
      gbraid: "0AAAAAD-ios-app-click",
      wbraid: "CjkKCQ-ios-web-click",
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
        u: "https://langfuse.com/?utm_source=x&gclid=Cj0-initial&gbraid=gb-initial&wbraid=wb-initial&li_fat_id=li-initial&rdt_cid=rdt-initial&twclid=tw-initial",
      },
    });
    expect(
      getAdClickIdsFromRequest({
        cookies: { [posthogCookieName]: cookieValue },
      }),
    ).toEqual({
      gclid: "Cj0-initial",
      gbraid: "gb-initial",
      wbraid: "wb-initial",
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
          lf_gbraid: "jane@example.com",
          lf_li_fat_id: "a".repeat(513),
        },
      }),
    ).toEqual({});
  });
});

describe("getSignupSourceFromRequest", () => {
  const docsCookieName = "ph_phc_docsProjectKey_posthog";
  const appCookieName = "ph_phc_appProjectKey_posthog";
  const posthogCookie = (initialPersonInfo: { u: string; r?: string }) =>
    JSON.stringify({
      distinct_id: "some-id",
      $initial_person_info: initialPersonInfo,
    });

  const originalPosthogKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  beforeEach(() => {
    (env as any).NEXT_PUBLIC_POSTHOG_KEY = "phc_appProjectKey";
  });
  afterEach(() => {
    (env as any).NEXT_PUBLIC_POSTHOG_KEY = originalPosthogKey;
  });

  it("reads the cookie as posthog-js writes it", () => {
    // Written by posthog-js 1.417.1 (persistence: "cookie") on a local page
    // opened at /docs/get-started?utm_source=google&utm_campaign=q4+launch
    // from https://www.google.com/. Next.js URL-decodes cookie values.
    const rawCookieValue =
      "%7B%22%24initialization_time%22%3A%222026-10-30T13%3A54%3A48.518" +
      "Z%22%2C%22%24configured_session_timeout_ms%22%3A1800000%2C%22dis" +
      "tinct_id%22%3A%2201a18d17-7a48-7307-b9ae-abac06119b25%22%2C%22%2" +
      "4device_id%22%3A%2201a18d17-7a48-7307-b9ae-abac06119b25%22%2C%22" +
      "%24user_state%22%3A%22anonymous%22%2C%22%24capture_rate_limit%22" +
      "%3A%7B%22tokens%22%3A98.14%2C%22last%22%3A1793368488534%7D%2C%22" +
      "%24initial_person_info%22%3A%7B%22r%22%3A%22https%3A%2F%2Fwww.go" +
      "ogle.com%2F%22%2C%22u%22%3A%22http%3A%2F%2F127.0.0.1%3A58232%2Fd" +
      "ocs%2Fget-started%3Futm_source%3Dgoogle%26utm_campaign%3Dq4%2Bla" +
      "unch%22%7D%2C%22%24sesid%22%3A%5B1793368488521%2C%2201a18d17-7a5" +
      "1-7a13-ac9d-9d95269ccf7e%22%2C1793368488521%5D%2C%22%24client_se" +
      "ssion_props%22%3A%7B%22sessionId%22%3A%2201a18d17-7a51-7a13-ac9d" +
      "-9d95269ccf7e%22%2C%22props%22%3A%7B%22r%22%3A%22https%3A%2F%2Fw" +
      "ww.google.com%2F%22%2C%22u%22%3A%22http%3A%2F%2F127.0.0.1%3A5823" +
      "2%2Fdocs%2Fget-started%3Futm_source%3Dgoogle%26utm_campaign%3Dq4" +
      "%2Blaunch%22%7D%7D%7D";
    expect(
      getSignupSourceFromRequest({
        cookies: { [docsCookieName]: decodeURIComponent(rawCookieValue) },
      }),
    ).toStrictEqual({
      utm_source: "google",
      utm_campaign: "q4 launch",
      signup_referrer: "www.google.com",
      signup_landing_host: "127.0.0.1:58232",
      signup_landing_path: "/docs/get-started",
    });
  });

  it("reads every utm param, the referrer's host, the landing host and the landing path without its query string", () => {
    expect(
      getSignupSourceFromRequest({
        cookies: {
          [docsCookieName]: posthogCookie({
            r: "https://news.ycombinator.com/item?id=123",
            u: "https://langfuse.com/docs/get-started?utm_source=newsletter&utm_medium=email&utm_campaign=q4+launch&utm_term=llm+observability&utm_content=hero-cta&ref=abc",
          }),
        },
      }),
    ).toStrictEqual({
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "q4 launch",
      utm_term: "llm observability",
      utm_content: "hero-cta",
      signup_referrer: "news.ycombinator.com",
      signup_landing_host: "langfuse.com",
      signup_landing_path: "/docs/get-started",
    });
  });

  it("returns only the landing path for a direct visit without utm params", () => {
    expect(
      getSignupSourceFromRequest({
        cookies: {
          [docsCookieName]: posthogCookie({
            r: "$direct",
            u: "https://langfuse.com/",
          }),
        },
      }),
    ).toStrictEqual({
      signup_landing_host: "langfuse.com",
      signup_landing_path: "/",
    });
  });

  it("prefers another PostHog cookie over the app's own", () => {
    expect(
      getSignupSourceFromRequest({
        cookies: {
          [appCookieName]: posthogCookie({
            r: "https://langfuse.com/",
            u: "https://cloud.langfuse.com/auth/sign-up",
          }),
          [docsCookieName]: posthogCookie({
            r: "https://www.google.com/",
            u: "https://langfuse.com/?utm_source=google",
          }),
        },
      }),
    ).toStrictEqual({
      utm_source: "google",
      signup_referrer: "www.google.com",
      signup_landing_host: "langfuse.com",
      signup_landing_path: "/",
    });
  });

  it("uses the app's own PostHog cookie when it is the only one", () => {
    expect(
      getSignupSourceFromRequest({
        cookies: {
          [appCookieName]: posthogCookie({
            r: "$direct",
            u: "https://cloud.langfuse.com/auth/sign-up?utm_source=linkedin",
          }),
        },
      }),
    ).toStrictEqual({
      utm_source: "linkedin",
      signup_landing_host: "cloud.langfuse.com",
      signup_landing_path: "/auth/sign-up",
    });
  });

  it.each([
    ["/auth/sign-up", "/auth/sign-up"],
    [
      "/project/clx7proj01/prompts/acme-checkout-agent",
      "/project/[projectId]/prompts/*",
    ],
    ["/project/clx7proj01", "/project/[projectId]"],
    ["/public/traces/b2c4e6f8a0", "/public/traces/*"],
    ["/demo/project/clx7demo01/traces", "/demo/project/*"],
    [
      "/EN/project/clx7proj01/traces/b2c4e6f8a0",
      "/project/[projectId]/traces/*",
    ],
    ["/auth/sign-up/", "/auth/sign-up"],
    ["/Project/clx7proj01/traces", "/project/[projectId]/traces"],
  ])(
    "stores an app landing path as its section, ids replaced: %s",
    (path, stored) => {
      expect(
        getSignupSourceFromRequest({
          cookies: {
            [appCookieName]: posthogCookie({
              r: "$direct",
              u: `https://cloud.langfuse.com${path}?promptVersion=2`,
            }),
          },
        }),
      ).toStrictEqual({
        signup_landing_host: "cloud.langfuse.com",
        signup_landing_path: stored,
      });
    },
  );

  it.each([
    ["invalid JSON", "%%%not-json"],
    ["an unknown shape", JSON.stringify({ $initial_person_info: "x" })],
  ])("returns an empty object for a cookie with %s", (_, cookieValue) => {
    expect(
      getSignupSourceFromRequest({
        cookies: { [docsCookieName]: cookieValue },
      }),
    ).toStrictEqual({});
  });

  it("drops over-long values and utm values with characters outside the allowlist", () => {
    expect(
      getSignupSourceFromRequest({
        cookies: {
          [docsCookieName]: posthogCookie({
            r: `https://${"a".repeat(300)}.com/`,
            u: `https://${"a".repeat(300)}.com/${"a".repeat(300)}?utm_source=jane%40example.com&utm_medium=cpc&utm_campaign=${"a".repeat(257)}`,
          }),
        },
      }),
    ).toStrictEqual({ utm_medium: "cpc" });
  });

  it.each([
    ["langfuse.com", "/users/jane@example.com"],
    ["cloud.langfuse.com", "/users/jane%40example.com"],
  ])(
    "drops a landing path that may hold an email address: %s%s",
    (host, path) => {
      expect(
        getSignupSourceFromRequest({
          cookies: {
            [docsCookieName]: posthogCookie({
              r: "$direct",
              u: `https://${host}${path}?utm_source=newsletter`,
            }),
          },
        }),
      ).toStrictEqual({
        utm_source: "newsletter",
        signup_landing_host: host,
      });
    },
  );
});

describe("getSignupAttributionFromRequest", () => {
  it("combines the provider, the ad click ids and the first visit's source", () => {
    expect(
      getSignupAttributionFromRequest(
        {
          cookies: {
            lf_gclid: "Cj0KCQjw_google-123",
            ph_phc_docsProjectKey_posthog: JSON.stringify({
              $initial_person_info: {
                r: "$direct",
                u: "https://langfuse.com/pricing?utm_source=google",
              },
            }),
          },
        },
        "github",
      ),
    ).toStrictEqual({
      provider: "github",
      adClickIds: { gclid: "Cj0KCQjw_google-123" },
      signupSource: {
        utm_source: "google",
        signup_landing_host: "langfuse.com",
        signup_landing_path: "/pricing",
      },
    });
  });

  it("names multi-tenant SSO providers sso, without the customer's domain", () => {
    expect(
      getSignupAttributionFromRequest({ cookies: {} }, "example.co.uk.okta")
        .provider,
    ).toBe("sso");
  });
});

describe("app landing paths", () => {
  const pagesDir = join(__dirname, "../../../pages");
  const notPages = /^(api\/.*|_app|_document|_error|404|500)$/;
  const sentinel = "sentinel-7f3a";
  // redirect on the server before any page renders; their tail is an app path
  const forwarders = ["/demo/[[...path]]", "/project/~/[[...path]]"];

  const pageRoutesInTree = () =>
    readdirSync(pagesDir, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(tsx?|jsx?)$/.test(file))
      .map((file) => file.replace(/\.(tsx?|jsx?)$/, ""))
      .filter((page) => !notPages.test(page))
      .map((page) => `/${page}`.replace(/\/index$/, "") || "/");

  const storedPathOf = (route: string) => {
    const path = route
      .replace(/\[\[?\.\.\.\w+\]\]?/, `${sentinel}/${sentinel}`)
      .replace(/\[\w+\]/g, sentinel);
    return getSignupSourceFromRequest({
      cookies: {
        ph_phc_appProjectKey_posthog: JSON.stringify({
          $initial_person_info: {
            r: "$direct",
            u: `https://cloud.langfuse.com${path}`,
          },
        }),
      },
    }).signup_landing_path;
  };

  it("keeps no dynamic segment of any page", () => {
    const routes = pageRoutesInTree();
    expect(routes).toEqual(expect.arrayContaining(forwarders));
    const leaking = routes.filter(
      (route) =>
        !forwarders.includes(route) && storedPathOf(route)?.includes(sentinel),
    );
    expect(leaking).toStrictEqual([]);
  });

  it("lists the locales next.config.mjs serves pages under", () => {
    expect(LOCALES).toStrictEqual(nextConfig.i18n?.locales);
  });
});
