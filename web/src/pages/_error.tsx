import { captureUnderscoreErrorException, lastEventId } from "@sentry/nextjs";
import NextErrorComponent, { type ErrorProps } from "next/error";
import type { NextPageContext } from "next";
import { CrashErrorPage } from "@/src/components/crash-error-page";

type LangfuseErrorPageProps = ErrorProps & {
  sentryEventId?: string;
};

const ErrorPage = ({
  hostname,
  sentryEventId,
  statusCode,
  title,
}: LangfuseErrorPageProps) => {
  return (
    <CrashErrorPage
      hostname={hostname}
      sentryEventId={sentryEventId ?? lastEventId()}
      statusCode={statusCode}
      title={title}
    />
  );
};

ErrorPage.getInitialProps = async (
  context: NextPageContext,
): Promise<LangfuseErrorPageProps> => {
  const errorInitialProps = await NextErrorComponent.getInitialProps(context);
  const sentryEventId = await captureUnderscoreErrorException(context);

  return {
    ...errorInitialProps,
    sentryEventId,
  };
};

export default ErrorPage;
