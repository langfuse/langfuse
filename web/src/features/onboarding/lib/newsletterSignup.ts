export const NEWSLETTER_OUTCOMES = [
  "subscribed",
  "declined",
  "unreachable",
  "failed",
] as const;

const REACHABILITY_CHECK_URL = "https://langfuse.com/api/latest-releases";
export const NEWSLETTER_SIGNUP_URL =
  "https://langfuse.com/api/productUpdateSignup";
const SIGNUP_SOURCE = "self-hosted-onboarding";
const REACHABILITY_CHECK_TIMEOUT_MS = 3_000;
const SIGNUP_TIMEOUT_MS = 5_000;
const CHANGELOG_URL = "https://langfuse.com/changelog";
const OSS_NEWSLETTER_URL = "https://langfuse.com/self-hosting/oss-newsletter";
const FALLBACK_URLS: Record<NewsletterList, string> = {
  oss: OSS_NEWSLETTER_URL,
  product: CHANGELOG_URL,
};
const FALLBACK_ORDER: NewsletterList[] = ["oss", "product"];

/** Resolves false when the browser cannot reach langfuse.com within 3 s; never rejects. */
export const checkLangfuseReachable = async (): Promise<boolean> => {
  try {
    await fetch(REACHABILITY_CHECK_URL, {
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(REACHABILITY_CHECK_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
};

/** Sends the address straight from the browser to langfuse.com; never rejects. */
export const subscribeToNewsletter = async ({
  email,
  lists,
}: {
  email: string;
  lists: NewsletterList[];
}): Promise<"subscribed" | "failed"> => {
  try {
    const response = await fetch(NEWSLETTER_SIGNUP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, lists, source: SIGNUP_SOURCE }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(SIGNUP_TIMEOUT_MS),
    });
    return response.status === 200 ? "subscribed" : "failed";
  } catch {
    return "failed";
  }
};

/** Pages where users sign up by hand for each offered list when the browser cannot do it for them. */
export const getNewsletterFallbackLinks = (lists: NewsletterList[]) =>
  FALLBACK_ORDER.filter((list) => lists.includes(list)).map((list) => ({
    list,
    url: FALLBACK_URLS[list],
  }));

export type NewsletterList = "product" | "oss";
/** How the self-hosted onboarding step ended; the server stores it with the lists it offered. */
export type NewsletterOutcome = (typeof NEWSLETTER_OUTCOMES)[number];
