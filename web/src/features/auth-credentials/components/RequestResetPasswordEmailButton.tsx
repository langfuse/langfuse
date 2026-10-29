import { signIn, useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { env } from "@/src/env.mjs";
import {
  TURNSTILE_ACTIONS,
  TURNSTILE_FAILED_MESSAGE,
  type TurnstileAction,
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
  sharedTurnstile,
}: {
  email: string;
  callbackUrl?: string;
  onEmailSent: () => void;
  label?: string;
  // Set when the page already shows a Turnstile widget. This button then
  // uses that widget instead of mounting a second one.
  sharedTurnstile?: {
    token: string | undefined;
    action: TurnstileAction;
    onPreparePasswordReset: () => void;
    onRejectToken: () => void;
  };
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [awaitingSharedToken, setAwaitingSharedToken] = useState(false);
  const sendStarted = useRef(false);
  const sendResetEmailRef = useRef<
    (token: string | undefined) => Promise<void>
  >(async () => {});
  const session = useSession();
  const capture = usePostHogClientCapture();
  const isValidEmail = z.email().safeParse(email).success;
  const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const captchaToken = sharedTurnstile?.token ?? turnstileToken;
  const awaitingPasswordResetToken =
    awaitingSharedToken ||
    (sharedTurnstile
      ? sharedTurnstile.action === TURNSTILE_ACTIONS.passwordReset &&
        !sharedTurnstile.token
      : Boolean(turnstileSiteKey) && !turnstileToken);

  async function sendResetEmail(token: string | undefined) {
    if ((sharedTurnstile || turnstileSiteKey) && !token) return;
    capture("auth:reset_password_email_requested");
    setIsLoading(true);
    setErrorMessage(null);
    let sent = false;
    try {
      const targetCallbackUrl = callbackUrl
        ? `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${callbackUrl}`
        : `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/auth/reset-password`;
      const res = await signIn("email", {
        email: email,
        callbackUrl: targetCallbackUrl,
        redirect: false,
        ...(token ? { turnstileToken: token } : {}),
      });
      if (res?.error) {
        setErrorMessage(resetEmailSignInError(res.error));
      } else if (res?.ok) {
        sent = true;
        onEmailSent();
      }
    } catch (error) {
      console.error("Error sending reset password email:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      // The token was redeemed (or rejected) by this attempt either way.
      if (sharedTurnstile) {
        if (!sent) sharedTurnstile.onRejectToken();
      } else {
        turnstileRef.current?.reset();
      }
      setIsLoading(false);
    }
  }

  sendResetEmailRef.current = sendResetEmail;

  useEffect(() => {
    if (!awaitingSharedToken || !sharedTurnstile?.token) return;
    if (sharedTurnstile.action !== TURNSTILE_ACTIONS.passwordReset) return;
    if (sendStarted.current) return;
    sendStarted.current = true;
    const token = sharedTurnstile.token;
    setAwaitingSharedToken(false);
    sendResetEmailRef.current(token).finally(() => {
      sendStarted.current = false;
    });
  }, [awaitingSharedToken, sharedTurnstile?.action, sharedTurnstile?.token]);

  const handleResetPassword = () => {
    if (!isValidEmail) return;
    if (
      sharedTurnstile &&
      sharedTurnstile.action !== TURNSTILE_ACTIONS.passwordReset
    ) {
      setAwaitingSharedToken(true);
      sharedTurnstile.onPreparePasswordReset();
      return;
    }
    sendResetEmail(captchaToken);
  };

  return (
    <>
      {turnstileSiteKey && !sharedTurnstile ? (
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
        disabled={!isValidEmail || awaitingPasswordResetToken}
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
