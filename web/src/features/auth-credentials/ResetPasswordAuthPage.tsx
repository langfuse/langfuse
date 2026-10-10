import { useRouter } from "next/router";
import { ResetPasswordPage } from "@/src/features/auth-credentials/components/ResetPasswordPage";

type PageProps = {
  passwordResetAvailable: boolean;
};

export default function ResetPasswordAuthPage({
  passwordResetAvailable,
}: PageProps) {
  const router = useRouter();
  // `?email=` carries the address already typed on the sign-in page so it does
  // not have to be entered a second time. The page is server-rendered, so the
  // query is populated on the first render and the value reaches the form's
  // initial state. Prefilling only fills the field — requesting the reset email
  // stays an explicit click, and an address that is not a valid email leaves
  // that button disabled.
  const emailParam = router.query.email;

  return (
    <ResetPasswordPage
      passwordResetAvailable={passwordResetAvailable}
      initialEmail={typeof emailParam === "string" ? emailParam : ""}
    />
  );
}
