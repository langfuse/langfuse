import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod/v4";
import { useForm } from "react-hook-form";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
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
import { captureException } from "@sentry/nextjs";

const enterpriseSsoFormSchema = z.object({
  email: z.string().email(),
});

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
  workos: "WorkOS",
  wordpress: "WordPress",
  custom: "Custom OAuth",
};

export default function EnterpriseSsoRequiredPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailFromQuery =
    typeof router.query.email === "string" ? router.query.email : "";
  const attemptedProvider =
    typeof router.query.attemptedProvider === "string"
      ? router.query.attemptedProvider
      : undefined;
  const callbackUrl =
    typeof router.query.callbackUrl === "string"
      ? router.query.callbackUrl
      : undefined;

  const friendlyProviderName = useMemo(() => {
    if (!attemptedProvider) return undefined;
    return (
      PROVIDER_LABELS[attemptedProvider] ?? attemptedProvider.replace(/-/g, " ")
    );
  }, [attemptedProvider]);

  const form = useForm<z.infer<typeof enterpriseSsoFormSchema>>({
    resolver: zodResolver(enterpriseSsoFormSchema),
    defaultValues: {
      email: emailFromQuery,
    },
  });

  useEffect(() => {
    if (emailFromQuery) {
      form.setValue("email", emailFromQuery);
    }
  }, [emailFromQuery, form]);

  async function onSubmit(values: z.infer<typeof enterpriseSsoFormSchema>) {
    setError(null);
    setLoading(true);

    const domain = values.email.split("@")[1]?.toLowerCase();
    if (!domain) {
      form.setError("email", { message: "Invalid email address" });
      setLoading(false);
      return;
    }

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
        const { providerId } = (await response.json()) as {
          providerId: string;
        };
        await signIn(providerId, {
          callbackUrl,
        });
        return;
      }

      if (response.status === 404) {
        setError(
          "We couldn't find a custom Enterprise SSO configuration for this domain. Double-check your company email or contact your administrator.",
        );
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setError(
        data?.message ??
          "Unable to start the Enterprise SSO sign-in flow. Please try again.",
      );
    } catch (err) {
      captureException(err);
      setError(
        "Something went wrong while checking your Enterprise SSO configuration. Please try again.",
      );
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
      <div className="flex min-h-screen-with-banner flex-col justify-center bg-background px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <LangfuseIcon className="mx-auto" />
          <h1 className="mt-6 text-center text-2xl font-bold text-primary">
            Use your Enterprise SSO
          </h1>
          <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
            {description} Enter your company email so we can send you to the
            correct identity provider.
          </p>
        </div>

        <div className="mt-10 rounded-lg border border-border bg-card px-6 py-8 shadow sm:mx-auto sm:w-full sm:max-w-md">
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
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
          {error ? (
            <div className="mt-4 text-center text-sm font-medium text-destructive">
              {error}
              <br />
              Contact{" "}
              <a
                href="mailto:support@langfuse.com"
                className="text-primary-accent hover:text-hover-primary-accent"
              >
                support@langfuse.com
              </a>{" "}
              if this keeps happening.
            </div>
          ) : null}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <Link
              href="/auth/sign-in"
              className="text-primary-accent hover:text-hover-primary-accent"
            >
              Back to other sign-in options
            </Link>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Need help? Contact{" "}
          <a
            href="mailto:support@langfuse.com"
            className="text-primary-accent hover:text-hover-primary-accent"
          >
            support@langfuse.com
          </a>
          .
        </div>
      </div>
    </>
  );
}
