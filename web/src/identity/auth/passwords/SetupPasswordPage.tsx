import { ResetPasswordPage } from "@/src/identity/auth/passwords/components/ResetPasswordPage";

type PageProps = {
  passwordResetAvailable: boolean;
};

export default function SetupPasswordPage({
  passwordResetAvailable,
}: PageProps) {
  return (
    <ResetPasswordPage
      passwordResetAvailable={passwordResetAvailable}
      intent="setup"
    />
  );
}
