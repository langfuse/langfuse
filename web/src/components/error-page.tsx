import { Button } from "@/src/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/src/utils/reportError";
import { stripBasePath } from "@/src/utils/redirect";
import { useTranslations } from "next-intl";

export const ErrorPage = ({
  title,
  message,
  additionalButton,
  signInLabel,
}: {
  title?: string;
  message: string;
  signInLabel?: string;
  additionalButton?:
    | {
        label: string;
        href: string;
      }
    | {
        label: string;
        onClick: () => void;
      };
}) => {
  const t = useTranslations("sharedUi.common");
  const session = useSession();
  const router = useRouter();
  const newTargetPath = stripBasePath(router.asPath || "/");
  // Only include targetPath if it's not the root (since "/" is the default anyway)
  const targetPathQuery =
    newTargetPath !== "/"
      ? `?targetPath=${encodeURIComponent(newTargetPath)}`
      : "";

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <AlertCircle className="text-dark-red mb-4 h-12 w-12" />
      <h1 className="mb-4 text-xl font-bold">{title ?? t("error")}</h1>
      <p className="mb-6 text-center">{message}</p>
      <div className="flex gap-3">
        {session.status === "unauthenticated" ? (
          <Button
            onClick={() => router.push(`/auth/sign-in${targetPathQuery}`)}
          >
            {signInLabel ?? t("signIn")}
          </Button>
        ) : null}
        {additionalButton ? (
          "onClick" in additionalButton ? (
            <Button variant="secondary" onClick={additionalButton.onClick}>
              {additionalButton.label}
            </Button>
          ) : (
            <Button variant="secondary" asChild>
              <Link href={additionalButton.href}>{additionalButton.label}</Link>
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
};

export const ErrorPageWithSentry = ({
  title,
  message,
  additionalButton,
  expected = false,
  signInLabel,
  reportingTitle,
  reportingMessage,
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
  signInLabel?: string;
  reportingTitle?: string;
  reportingMessage?: string;
}) => {
  const t = useTranslations("sharedUi.common");
  const resolvedTitle = title ?? t("error");
  const sentryTitle = reportingTitle ?? title ?? "Error";
  const sentryMessage = reportingMessage ?? message;

  useEffect(() => {
    // Capture the error with Sentry (breadcrumb only when expected)
    if (window !== undefined)
      reportError(
        new Error(
          `ErrorPageWithSentry rendered: ${sentryTitle}, ${sentryMessage}`,
        ),
        {
          area: "error-page",
          expected,
          extra: { title: sentryTitle, message: sentryMessage },
        },
      );
  }, [sentryTitle, sentryMessage, expected]);

  return (
    <ErrorPage
      title={resolvedTitle}
      message={message}
      additionalButton={additionalButton}
      signInLabel={signInLabel}
    />
  );
};
