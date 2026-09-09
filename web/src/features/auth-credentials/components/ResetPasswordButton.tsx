import { signIn, useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import { useState } from "react";
import { z } from "zod";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { env } from "@/src/env.mjs";

export function RequestResetPasswordEmailButton({
  email,
  callbackUrl,
  onEmailSent,
  label,
}: {
  email: string;
  callbackUrl?: string;
  onEmailSent: () => void;
  label?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const session = useSession();
  const capture = usePostHogClientCapture();
  const isValidEmail = z.email().safeParse(email).success;

  const handleResetPassword = async () => {
    if (!isValidEmail) return;
    capture("auth:reset_password_email_requested");
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const targetCallbackUrl = callbackUrl
        ? `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${callbackUrl}`
        : `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/reset-password`;
      const res = await signIn("email", {
        email: email,
        callbackUrl: targetCallbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setErrorMessage(
          res.error === "AccessDenied"
            ? "This email is not associated with any account."
            : res.error,
        );
      } else if (res?.ok) {
        onEmailSent();
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
        type="button"
        onClick={handleResetPassword}
        loading={isLoading}
        disabled={!isValidEmail}
        className="w-full"
      >
        {label ??
          (session.status === "authenticated"
            ? "Send verification code"
            : "Request password reset")}
      </Button>
      {errorMessage && (
        <div className="text-destructive mt-3 text-center text-sm">
          {errorMessage}
        </div>
      )}
    </>
  );
}
