import { useRouter } from "next/router";
import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";

type PageProps = {
  passwordResetAvailable: boolean;
};

export default function ResetPasswordAuthPage({
  passwordResetAvailable,
}: PageProps) {
  const router = useRouter();
  /** Prefills the email from `?email=`, which the sign-in page's reset link sets. */
  // getServerSideProps keeps the query populated on the first render, which is
  // what seeding ResetPasswordPage's useState depends on. A repeated param
  // arrives as an array and is dropped.
  const emailParam = router.query.email;

  return (
    <ResetPasswordPage
      passwordResetAvailable={passwordResetAvailable}
      initialEmail={typeof emailParam === "string" ? emailParam : ""}
    />
  );
}
