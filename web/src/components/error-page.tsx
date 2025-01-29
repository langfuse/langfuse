import { Button } from "@/src/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Link from "next/link";
import { captureException } from "@sentry/nextjs";

export const ErrorPage = ({
  title = "Error",
  message,
  additionalButton,
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
}) => {
  const session = useSession();
  const router = useRouter();
  const newTargetPath = router.asPath;

  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <AlertCircle className="mb-4 h-12 w-12 text-dark-red" />
      <h1 className="mb-4 text-xl font-bold">{title}</h1>
      <p className="mb-6 text-center">{message}</p>
      <div className="flex gap-3">
        {session.status === "unauthenticated" ? (
          <Button
            onClick={() =>
              void router.push(
                `/auth/sign-in?targetPath=${encodeURIComponent(newTargetPath)}`,
              )
            }
          >
            Sign In
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
  title = "Error",
  message,
}: {
  title?: string;
  message: string;
}) => {
  useEffect(() => {
    // Capture the error with Sentry
    if (window !== undefined)
      captureException(
        new Error(`ErrorPageWithSentry rendered: ${title}, ${message}`),
      );
  }, [title, message]); // Empty dependency array means this effect runs once on mount

  return <ErrorPage title={title} message={message} />;
};
