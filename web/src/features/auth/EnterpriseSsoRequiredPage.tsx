import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useForm } from "react-hook-form";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Button } from "@/src/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { Input } from "@/src/components/ui/input";
import { env } from "@/src/env.mjs";
import { reportError } from "@/src/utils/reportError";
import { isJsonParseSyntaxError } from "@/src/features/auth/lib/expectedAuthErrors";
import { asSingleQueryParam } from "@/src/hooks/useReadyRouteParams";
import { getSafeRedirectPath } from "@/src/utils/redirect";

const enterpriseSsoFormSchema = z.object({
  email: z.email(),
});

/**
 * The page is shown so the user can read why their provider was rejected
 * before the browser leaves for the identity provider.
 */
const AUTO_REDIRECT_DELAY_MS = 1000;

const NO_SSO_CONFIG_MESSAGE =
  "We couldn't find a custom Enterprise SSO configuration for this domain. Double-check your company email or contact your administrator.";

const UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong while checking your Enterprise SSO configuration. Please try again.";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  "github-enterprise": "GitHub Enterprise",
  gitlab: "GitLab",
  "azure-ad": "Azure AD",
  okta: "Okta",
  authentik: "Authentik",
  onelogin: "OneLogin",
  auth0: "Auth0",
  cognito: "Cognito",
  keycloak: "Keycloak",
  jumpcloud: "JumpCloud",
  workos: "WorkOS",
  wordpress: "WordPress",
  custom: "Custom OAuth",
};

type SsoLookup =
  | { status: "found"; providerId: string }
  | { status: "no-config" }
  | { status: "error"; message: string };

function emailDomain(email: string | undefined): string | undefined {
  return email?.split("@")[1]?.toLowerCase() || undefined;
}

async function lookupSsoProviderId(domain: string): Promise<SsoLookup> {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/check-sso`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      },
    );

    if (response.ok) {
      const { providerId } = (await response.json()) as { providerId: string };
      return { status: "found", providerId };
    }

    if (response.status === 404) {
      return { status: "no-config" };
    }

    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    return {
      status: "error",
      message:
        data?.message ??
        "Unable to start the Enterprise SSO sign-in flow. Please try again.",
    };
  } catch (err) {
    reportError(err, {
      area: "auth.enterpriseSso",
      expected: isJsonParseSyntaxError(err),
      extra: { context: "auth.enterpriseSso" },
    });
    return { status: "error", message: UNEXPECTED_ERROR_MESSAGE };
  }
}

type AutoRedirect = "unavailable" | "pending" | { providerId: string };

function deriveAutoRedirect(
  domain: string | undefined,
  lookup: { isPending: boolean; data: SsoLookup | undefined },
): AutoRedirect {
  if (domain === undefined) return "unavailable";
  if (lookup.isPending) return "pending";
  if (lookup.data?.status === "found") {
    return { providerId: lookup.data.providerId };
  }
  return "unavailable";
}

/**
 * While the lookup is still running it is not yet known whether there is a
 * provider to redirect to, so neither instruction is shown rather than
 * promising a redirect that may not happen.
 */
function instructionFor(autoRedirect: AutoRedirect): string | null {
  if (autoRedirect === "pending") return null;
  if (autoRedirect === "unavailable") {
    return "Enter your company email so we can send you to the correct identity provider.";
  }
  return "Taking you there now.";
}

function SsoRedirectIndicator() {
  return (
    <div
      className="text-muted-foreground flex items-center justify-center gap-3 text-sm"
      role="status"
    >
      <Spinner size="sm" variant="muted" />
      Redirecting to your identity provider...
    </div>
  );
}

/**
 * Schedules the redirect to the identity provider. Mounting means a redirect
 * is pending; unmounting cancels it.
 */
function ScheduledSsoRedirect({
  providerId,
  callbackUrl,
  onError,
}: {
  providerId: string;
  callbackUrl: string | undefined;
  onError: (err: unknown) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      signIn(providerId, { callbackUrl }).catch(onError);
    }, AUTO_REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [providerId, callbackUrl, onError]);

  return <SsoRedirectIndicator />;
}

export default function EnterpriseSsoRequiredPage() {
  const router = useRouter();

  // `router.query` is empty on the first render of a statically-optimized
  // route, which is indistinguishable from "no email was passed". Waiting for
  // the real params lets the automatic redirect make that distinction, and
  // lets the form seed its default value instead of syncing it afterwards.
  if (!router.isReady) {
    return (
      <>
        <Head>
          <title>Enterprise SSO Required | Langfuse</title>
        </Head>
        <PageFrame>
          <div className="flex justify-center">
            <Spinner size="xl" variant="muted" />
          </div>
        </PageFrame>
      </>
    );
  }

  const email = asSingleQueryParam(router.query.email);

  return (
    <EnterpriseSsoRequired
      // A different address is a different sign-in attempt, so the form's
      // default value and the lookup start over rather than keeping the
      // previous one.
      key={email ?? ""}
      email={email}
      attemptedProvider={asSingleQueryParam(router.query.attemptedProvider)}
      callbackUrl={asSingleQueryParam(router.query.callbackUrl)}
    />
  );
}

function EnterpriseSsoRequired({
  email,
  attemptedProvider,
  callbackUrl,
}: {
  email: string | undefined;
  attemptedProvider: string | undefined;
  callbackUrl: string | undefined;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The page is reachable with an arbitrary `callbackUrl`, and the redirect
  // below needs no interaction, so the destination is sanitized the same way
  // the sign-in page sanitizes `targetPath`.
  const safeCallbackUrl = callbackUrl
    ? getSafeRedirectPath(callbackUrl)
    : undefined;

  const enforcedDomain = emailDomain(email);

  // The domain the user was redirected with already determines the provider,
  // so resolve it up front rather than making the user re-enter the address.
  const enforcedProvider = useQuery({
    queryKey: ["enterpriseSsoProvider", enforcedDomain],
    queryFn: enforcedDomain
      ? () => lookupSsoProviderId(enforcedDomain)
      : skipToken,
    retry: false,
    staleTime: Infinity,
  });

  // Domains enforced through AUTH_DOMAINS_WITH_SSO_ENFORCEMENT reach this page
  // without a custom SSO config, so there is nothing to redirect to and the
  // manual form stays the only way forward.
  const autoRedirect = deriveAutoRedirect(enforcedDomain, enforcedProvider);

  // Stable so that a parent re-render cannot restart the scheduled redirect.
  const handleRedirectError = useCallback((err: unknown) => {
    reportError(err, {
      area: "auth.enterpriseSso",
      expected: isJsonParseSyntaxError(err),
      extra: { context: "auth.enterpriseSso" },
    });
    setError(UNEXPECTED_ERROR_MESSAGE);
  }, []);

  const friendlyProviderName = useMemo(() => {
    if (!attemptedProvider) return undefined;
    return (
      PROVIDER_LABELS[attemptedProvider] ?? attemptedProvider.replace(/-/g, " ")
    );
  }, [attemptedProvider]);

  const form = useForm<z.infer<typeof enterpriseSsoFormSchema>>({
    resolver: zodResolver(enterpriseSsoFormSchema),
    defaultValues: {
      email: email ?? "",
    },
  });

  async function onSubmit(values: z.infer<typeof enterpriseSsoFormSchema>) {
    setError(null);
    setLoading(true);

    const domain = emailDomain(values.email);
    if (!domain) {
      form.setError("email", { message: "Invalid email address" });
      setLoading(false);
      return;
    }

    try {
      const lookup = await lookupSsoProviderId(domain);

      if (lookup.status === "found") {
        await signIn(lookup.providerId, { callbackUrl: safeCallbackUrl });
        return;
      }

      setError(
        lookup.status === "no-config" ? NO_SSO_CONFIG_MESSAGE : lookup.message,
      );
    } catch (err) {
      handleRedirectError(err);
    } finally {
      setLoading(false);
    }
  }

  const description = friendlyProviderName
    ? `You tried signing in with ${friendlyProviderName}, but this domain requires your company's custom Enterprise SSO.`
    : "This domain requires your company's custom Enterprise SSO.";

  return (
    <>
      <Head>
        <title>Enterprise SSO Required | Langfuse</title>
      </Head>
      <PageFrame>
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="mx-auto w-fit">
            <LangfuseIcon />
          </div>
          <h1 className="text-primary mt-6 text-center text-2xl font-bold">
            Use your Enterprise SSO
          </h1>
          <p className="text-muted-foreground mt-2 text-center text-sm">
            {description} {instructionFor(autoRedirect)}
          </p>
        </div>

        <div className="bg-card mt-10 rounded-lg px-6 py-8 shadow-sm sm:mx-auto sm:w-full sm:max-w-md">
          {autoRedirect === "pending" ? (
            <div className="flex justify-center">
              <Spinner size="md" variant="muted" />
            </div>
          ) : null}
          {typeof autoRedirect === "object" ? (
            <ScheduledSsoRedirect
              providerId={autoRedirect.providerId}
              callbackUrl={safeCallbackUrl}
              onError={handleRedirectError}
            />
          ) : null}
          {autoRedirect === "unavailable" ? (
            <Form {...form}>
              <form
                className="space-y-6"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="jsdoe@example.com"
                          allowPasswordManager
                          autoComplete="email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  loading={loading}
                  disabled={loading}
                >
                  Continue with Enterprise SSO
                </Button>
              </form>
            </Form>
          ) : null}
          {error ? (
            <div className="text-destructive mt-4 text-center text-sm font-bold">
              {error}
              <br />
              Contact{" "}
              <a
                href="mailto:support@langfuse.com"
                className="text-link hover:text-link-hover"
              >
                support@langfuse.com
              </a>{" "}
              if this keeps happening.
            </div>
          ) : null}
          <div className="text-muted-foreground mt-6 text-center text-sm">
            <Link
              href="/auth/sign-in"
              className="text-link hover:text-link-hover"
            >
              Back to other sign-in options
            </Link>
          </div>
        </div>

        <div className="text-muted-foreground mt-4 text-center text-xs">
          Need help? Contact{" "}
          <a
            href="mailto:support@langfuse.com"
            className="text-link hover:text-link-hover"
          >
            support@langfuse.com
          </a>
          .
        </div>
      </PageFrame>
    </>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
      {children}
    </div>
  );
}
