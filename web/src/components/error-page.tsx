import { Button } from "@/src/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export const ErrorPage = ({
  title = "Error",
  message,
}: {
  title?: string;
  message: string;
}) => {
  const session = useSession();
  const router = useRouter();
  const newTargetPath = router.asPath;

  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
      <h1 className="mb-4 text-xl font-bold">{title}</h1>
      <p className="mb-8 text-center">{message}</p>
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
