import { signIn, useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
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
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidEmail, setIsValidEmail] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const session = useSession();
  const router = useRouter();
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

  const handleVerify = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!code) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const formattedEmail = encodeURIComponent(email.toLowerCase().trim());
      const formattedCode = encodeURIComponent(code.trim());
      const callback = encodeURIComponent(
        `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/reset-password`,
      );
      const url = `/api/auth/callback/email?email=${formattedEmail}&token=${formattedCode}&callbackUrl=${callback}`;
      const res = await fetch(url);
      if (res.url.includes("/auth/reset-password")) {
        router.reload();
      } else {
        setErrorMessage("Invalid code. Please try again.");
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
        <form onSubmit={handleVerify} className="flex flex-col space-y-2">
          <span className="text-sm text-center">Check your inbox for the code</span>
          <Input
            type="number"
            minLength={6}
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="One time passcode"
            className="w-full"
          />
          <Button
            type="submit"
            className={className}
            loading={isLoading}
            disabled={!code || code.length !== 6}
            variant={variant}
          >
            Verify code
          </Button>
        </form>
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
