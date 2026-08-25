import { signIn, useSession } from "next-auth/react";
import { useState } from "react";
import { z } from "zod";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { env } from "@/src/env.mjs";
import { RequestResetPasswordEmailButtonView } from "./RequestResetPasswordEmailButtonView";
import { VerifyResetPasswordButtonView } from "./VerifyResetPasswordButtonView";

export function RequestResetPasswordEmailButton({
  email,
  callbackUrl,
}: {
  email: string;
  callbackUrl?: string;
}) {
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [code, setCode] = useState("");
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
        setIsEmailSent(true);
      }
    } catch (error) {
      console.error("Error sending reset password email:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const formattedEmail = encodeURIComponent(email.toLowerCase().trim());
      const formattedCode = encodeURIComponent(code.trim());
      const targetCb = callbackUrl
        ? `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${callbackUrl}`
        : `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/reset-password`;
      const callback = encodeURIComponent(targetCb);
      const url = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth/callback/email?email=${formattedEmail}&token=${formattedCode}&callbackUrl=${callback}`;
      // Existing hard navigation is accepted during the Next.js 16.3 migration.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = url;
    } catch (error) {
      console.error("Error verifying code:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {isEmailSent ? (
        <VerifyResetPasswordButtonView
          code={code}
          loading={isLoading}
          onCodeChange={setCode}
          onVerify={handleVerify}
        />
      ) : (
        <RequestResetPasswordEmailButtonView
          onClick={handleResetPassword}
          loading={isLoading}
          disabled={!isValidEmail}
          buttonLabel={
            session.status === "authenticated"
              ? "Verify email to change password"
              : "Request password reset"
          }
        />
      )}
      {errorMessage && (
        <div className="text-destructive mt-3 text-center text-sm">
          {errorMessage}
        </div>
      )}
    </>
  );
}
