import { PostHog as OriginalPosthog } from "posthog-node";

// Safe as it is intended to be public
const PUBLIC_POSTHOG_API_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ||
  "phc_zkMwFajk8ehObUlMth0D7DtPItFnxETi3lmSvyQDrwB";

export class ServerPosthog extends OriginalPosthog {
  constructor() {
    super(PUBLIC_POSTHOG_API_KEY);

    if (process.env.NODE_ENV === "development") this.debug();
  }
}
