import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";

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
