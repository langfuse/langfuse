import { lastEventId } from "@sentry/nextjs";
import { useEffect, useState } from "react";

type CrashErrorPageProps = {
  hostname?: string;
  sentryEventId?: string;
  statusCode?: number;
  title?: string;
};

const statusTitles: Record<number, string> = {
  400: "Bad Request",
  404: "This page could not be found",
  405: "Method Not Allowed",
  500: "Internal Server Error",
};

export const CrashErrorPage = ({
  hostname,
  sentryEventId,
  statusCode,
  title,
}: CrashErrorPageProps) => {
  const [resolvedSentryEventId, setResolvedSentryEventId] =
    useState(sentryEventId);

  useEffect(() => {
    setResolvedSentryEventId((currentId) => currentId ?? lastEventId());
  }, []);

  const resolvedTitle =
    title ??
    (statusCode ? statusTitles[statusCode] : undefined) ??
    "An unexpected error has occurred";

  const description = statusCode
    ? `${resolvedTitle}.`
    : `Application error: a client-side exception has occurred${
        hostname ? ` while loading ${hostname}` : ""
      } (see the browser console for more information).`;

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center px-6 py-10">
      <div className="border-border bg-card w-full max-w-xl rounded-xl border p-8 shadow-sm">
        {statusCode ? (
          <p className="text-muted-foreground text-sm font-medium">
            Error {statusCode}
          </p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mt-4 text-sm leading-6">
          {description}
        </p>

        {resolvedSentryEventId ? (
          <div className="border-border bg-muted/40 mt-6 rounded-lg border p-4">
            <p className="text-sm font-medium">Crash identifiers</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Error ID</dt>
                <dd className="mt-1 font-mono text-xs">
                  {resolvedSentryEventId}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
};
