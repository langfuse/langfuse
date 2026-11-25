import { useEffect } from "react";
import { ErrorPage } from "@/src/components/ErrorPage";
import { reportError } from "@/src/utils/reportError";

export const ErrorPageWithSentry = ({
  title = "Error",
  message,
  additionalButton,
  expected = false,
}: {
  title?: string;
  message: string;
  additionalButton?:
    | {
        label: string;
        href: string;
      }
    | {
        label: string;
        onClick: () => void;
      };
  /** Expected, user-caused outcome: breadcrumb instead of a Sentry error. */
  expected?: boolean;
}) => {
  useEffect(() => {
    // Capture the error with Sentry (breadcrumb only when expected)
    if (window !== undefined)
      reportError(
        new Error(`ErrorPageWithSentry rendered: ${title}, ${message}`),
        { area: "error-page", expected, extra: { title, message } },
      );
  }, [title, message, expected]);

  return (
    <ErrorPage
      title={title}
      message={message}
      additionalButton={additionalButton}
    />
  );
};
