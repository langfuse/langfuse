import { signIn } from "next-auth/react";
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ErrorPageWithSentry } from "@/src/components/error-page";
import { Spinner } from "@/src/components/layouts/spinner";
import { useTranslations } from "next-intl";
import { AuthLanguageSwitcher } from "@/src/features/i18n/AuthLanguageSwitcher";

export default function SSOInitiate() {
  const t = useTranslations("auth.ssoInitiate");
  const signInT = useTranslations("auth.signIn");
  const router = useRouter();

  if (!router.isReady) {
    return <SSOLoading />;
  }

  const provider =
    typeof router.query.provider === "string" ? router.query.provider : null;

  if (!provider) {
    return (
      <>
        <Head>
          <title>{t("errorPageTitle")} | Langfuse</title>
        </Head>
        <AuthLanguageSwitcher />
        <ErrorPageWithSentry
          title={t("failedTitle")}
          message={t("missingProvider")}
          signInLabel={signInT("submit")}
          reportingTitle="SSO Sign-in Failed"
          reportingMessage="No SSO provider specified. Please contact your administrator."
          expected
        />
      </>
    );
  }

  return <SSOProviderRedirect provider={provider} />;
}

function SSOProviderRedirect({ provider }: { provider: string }) {
  const t = useTranslations("auth.ssoInitiate");
  const signInT = useTranslations("auth.signIn");
  const [reportingError, setReportingError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    signIn(provider).catch((error: unknown) => {
      if (!active) return;
      setReportingError(
        error instanceof Error
          ? error.message
          : "Failed to initiate SSO sign-in.",
      );
    });

    return () => {
      active = false;
    };
  }, [provider]);

  if (reportingError) {
    return (
      <>
        <Head>
          <title>{t("errorPageTitle")} | Langfuse</title>
        </Head>
        <AuthLanguageSwitcher />
        <ErrorPageWithSentry
          title={t("failedTitle")}
          message={t("failed")}
          signInLabel={signInT("submit")}
          reportingTitle="SSO Sign-in Failed"
          reportingMessage={reportingError}
        />
      </>
    );
  }

  return <SSOLoading />;
}

function SSOLoading() {
  const t = useTranslations("auth.ssoInitiate");
  return (
    <>
      <Head>
        <title>{t("signingInTitle")} | Langfuse</title>
      </Head>
      <AuthLanguageSwitcher />
      <Spinner message={t("redirecting")} />
    </>
  );
}
