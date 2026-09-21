// Redirect helper for /trace/[traceId] URLs
// Looks up the projectId for a trace and redirects to /project/[projectId]/traces/[traceId]
// which displays the current trace view

import { ErrorPage } from "@/src/components/error-page";
import { useRouter } from "next/router";

const TraceRedirectPage = ({
  notFound,
  duplicatesFound,
}: {
  notFound?: boolean;
  duplicatesFound?: boolean;
}) => {
  const router = useRouter();
  if (router.isFallback) {
    return <div className="p-3">Loading...</div>;
  }

  if (notFound) {
    return (
      <ErrorPage
        title="Trace not found"
        message="The trace is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (duplicatesFound) {
    return (
      <ErrorPage
        title="Trace not found"
        message="Please upgrade the SDK as the URL schema has changed."
      />
    );
  }

  return <div>Redirecting...</div>;
};

export default TraceRedirectPage;
