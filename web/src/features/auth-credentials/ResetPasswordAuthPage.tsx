import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";

type PageProps = {
  passwordResetAvailable: boolean;
};

export default function ResetPasswordAuthPage({
  passwordResetAvailable,
}: PageProps) {
  return <ResetPasswordPage passwordResetAvailable={passwordResetAvailable} />;
}
