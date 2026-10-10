import { signIn, useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import { useRef, useState } from "react";
import { z } from "zod";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { env } from "@/src/env.mjs";
import {
  TURNSTILE_ACTIONS,
  TURNSTILE_FAILED_MESSAGE,
} from "@/src/features/auth/constants";
import {
  TurnstileWidget,
  type TurnstileWidgetHandle,
} from "@/src/features/auth/components/TurnstileWidget";

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
  const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const handleResetPassword = async () => {
    if (!isValidEmail) return;
    if (turnstileSiteKey && !turnstileToken) return;
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
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      if (res?.error) {
        setErrorMessage(resetEmailSignInError(res.error));
      } else if (res?.ok) {
        onEmailSent();
      }
    } catch (error) {
      console.error("Error sending reset password email:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      // The token was redeemed (or rejected) by this attempt either way.
      turnstileRef.current?.reset();
      setIsLoading(false);
    }
  };

  return (
    <>
      {turnstileSiteKey ? (
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          action={TURNSTILE_ACTIONS.passwordReset}
          onTokenChange={setTurnstileToken}
        />
      ) : null}
      <Button
        type="button"
        onClick={handleResetPassword}
        loading={isLoading}
        disabled={
          !isValidEmail || (Boolean(turnstileSiteKey) && !turnstileToken)
        }
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

// NextAuth's email sign-in catch puts the thrown Error into the query via
// URLSearchParams, which stringifies it as "Error: <message>".
function resetEmailSignInError(error: string): string {
  if (error === "AccessDenied") {
    return "This email is not associated with any account.";
  }
  if (error.includes(TURNSTILE_FAILED_MESSAGE)) {
    return TURNSTILE_FAILED_MESSAGE;
  }
  return error;
}
