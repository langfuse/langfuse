import { signIn, useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useEffect, useState } from "react";
import { z } from "zod/v4";
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
  const [code, setCode] = useState("");
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

  const handleVerify = async (_e: React.MouseEvent<HTMLButtonElement>) => {
    if (!code) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Use signIn with redirect: false to handle errors properly
      const result = await signIn("email", {
        email: email.toLowerCase().trim(),
        token: code.trim(),
        callbackUrl: `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/reset-password`,
        redirect: false,
      });

      if (result?.error) {
        // Token verification failed - prompt user to request new OTP
        if (
          result.error === "Verification" ||
          result.error === "AccessDenied"
        ) {
          setErrorMessage(
            "Invalid or expired verification code. Please request a new code.",
          );
          // Reset the flow to allow requesting a new OTP
          setIsEmailSent(false);
          setCode("");
        } else {
          setErrorMessage(
            result.error === "AccessDenied"
              ? "This email is not associated with any account."
              : result.error,
          );
        }
      } else if (result?.ok) {
        // Success - redirect to reset password page
        window.location.href = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/reset-password`;
      }
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
        <div>
          <label htmlFor="otp-code" className="mb-2 block text-sm font-medium">
            Check your inbox for the code
          </label>
          <Input
            id="otp-code"
            type="number"
            minLength={6}
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            placeholder="One time passcode"
            className="mb-8 w-full"
          />
          <Button
            onClick={handleVerify}
            className={className}
            loading={isLoading}
            disabled={!code || code.length !== 6}
            variant={variant}
          >
            Verify code
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleResetPassword}
          className={className}
          loading={isLoading}
          disabled={!isValidEmail}
          variant={variant}
        >
          {session.status === "authenticated"
            ? "Verify email to change password"
            : "Request password reset"}
        </Button>
      )}
      {errorMessage && (
        <div className="mt-3 text-center text-sm text-destructive">
          {errorMessage}
        </div>
      )}
    </>
  );
}
