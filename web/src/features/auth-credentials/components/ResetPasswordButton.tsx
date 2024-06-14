import { signIn, useSession } from "next-auth/react";
import { Button } from "@/src/components/ui/button";
import { useState } from "react";

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
  const session = useSession();

  const handleResetPassword = async () => {
    setIsLoading(true);
    try {
      await signIn("email", {
        email: email,
        callbackUrl: "/auth/reset-password",
        redirect: false,
      });
      setIsEmailSent(true);
    } catch (error) {
      console.error("Error sending reset password email:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleResetPassword}
      className={className}
      loading={isLoading}
      disabled={isEmailSent}
      variant={variant}
    >
      {isEmailSent
        ? session.status === "authenticated"
          ? "Email sent. Please check your inbox"
          : "Email sent if account exists"
        : session.status === "authenticated"
          ? "Verify email to change password"
          : "Request password reset"}
    </Button>
  );
}
