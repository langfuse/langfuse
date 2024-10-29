import { signIn, useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import { useEffect, useState } from "react";
import { z } from "zod";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { env } from "@/src/env.mjs";

export function RequestResetPasswordEmailButton({
  email,
  className,
  variant = "default",
}: {
  email: string;
  className?: string;
  variant?: "default" | "secondary";
}) {
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidEmail, setIsValidEmail] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const session = useSession();
  const capture = usePostHogClientCapture();

  useEffect(() => {
    const isValidEmail = z.string().email().safeParse(email).success;
    setIsValidEmail(isValidEmail);
  }, [email]);

  const handleResetPassword = async () => {
    if (!isValidEmail) return;
    capture("auth:reset_password_email_requested");
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await signIn("email", {
        email: email,
        callbackUrl: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/reset-password`,
        redirect: false,
      });
      if (res?.error) {
        setErrorMessage(
          res.error === "AccessDenied"
            ? "This email is not associated with any account."
            : res.error,
        );
      } else if (res?.ok) {
        setIsEmailSent(true);
      }
    } catch (error) {
      console.error("Error sending reset password email:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleResetPassword}
        className={className}
        loading={isLoading}
        disabled={isEmailSent || !isValidEmail}
        variant={variant}
      >
        {isEmailSent
          ? "Email sent. Please check your inbox"
          : session.status === "authenticated"
            ? "Verify email to change password"
            : "Request password reset"}
      </Button>
      {errorMessage && (
        <div className="mt-3 text-center text-sm text-destructive">
          {errorMessage}
        </div>
      )}
    </>
  );
}
