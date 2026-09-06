import {
  captureUnderscoreErrorException,
  isEnabled as isSentryEnabled,
} from "@sentry/nextjs";
import Head from "next/head";
import NextErrorComponent, { type ErrorProps } from "next/error";
import type { NextPageContext } from "next";
import { CrashModal } from "@/src/components/CrashModal/CrashModal";
import { useTranslations } from "next-intl";

type LangfuseErrorPageProps = ErrorProps & {
  sentryEventId?: string;
  showReturnHome: boolean;
};

const ErrorPage = ({
  hostname,
  sentryEventId,
  showReturnHome,
  statusCode,
  title,
}: LangfuseErrorPageProps) => {
  const t = useTranslations("sharedUi.errorPage");
  const localizedStatusTitle =
    statusCode === 400
      ? t("badRequest")
      : statusCode === 404
        ? t("notFound")
        : statusCode === 405
          ? t("methodNotAllowed")
          : statusCode === 500
            ? t("internalServerError")
            : undefined;
  const resolvedTitle = localizedStatusTitle ?? title ?? t("unexpected");

  const description = statusCode
    ? t("statusDescription", { statusCode, title: resolvedTitle })
    : hostname
      ? t("applicationErrorWithHost", { hostname })
      : t("applicationError");

  const documentTitle = statusCode
    ? `${statusCode}: ${resolvedTitle}`
    : t("applicationErrorTitle");

  return (
    <>
      <Head>
        <title>{documentTitle}</title>
      </Head>
      <div className="min-h-screen-with-banner bg-background text-foreground flex items-center justify-center px-6 py-10">
        <CrashModal
          description={description}
          sentryEventId={sentryEventId}
          showReturnHome={showReturnHome}
          statusCode={statusCode}
        />
      </div>
    </>
  );
};

ErrorPage.skipAppLayout = true;

ErrorPage.getInitialProps = async (
  context: NextPageContext,
): Promise<LangfuseErrorPageProps> => {
  const errorInitialProps = await NextErrorComponent.getInitialProps(context);
  const sentryEventId = isSentryEnabled()
    ? await captureUnderscoreErrorException(context)
    : undefined;
  const pathname = context.asPath?.split(/[?#]/)[0];

  return {
    ...errorInitialProps,
    sentryEventId,
    showReturnHome: pathname !== "/",
  };
};

export default ErrorPage;
