import { ErrorPageWithSentry } from "@/src/components/error-page";
import { isExpectedAuthErrorPageMessage } from "@/src/features/auth/lib/expectedAuthErrors";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE } from "@/src/features/auth/constants";
import { AuthLanguageSwitcher } from "@/src/features/i18n/AuthLanguageSwitcher";

export default function AuthError() {
  const t = useTranslations("auth.error");
  const signInT = useTranslations("auth.signIn");
  const router = useRouter();
  const { error } = router.query;
  const rawErrorMessage = error ? decodeURIComponent(String(error)) : null;
  const errorMessage =
    rawErrorMessage === "Verification"
      ? t("verification")
      : rawErrorMessage === MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE
        ? t("domainMismatch")
        : t("fallback");

  return (
    <>
      <AuthLanguageSwitcher />
      <ErrorPageWithSentry
        title={t("title")}
        message={errorMessage}
        signInLabel={signInT("submit")}
        reportingTitle="Authentication Error"
        reportingMessage={rawErrorMessage ?? errorMessage}
        // Expired magic links and deliberate SSO-domain rejections are expected
        // outcomes (see expectedAuthErrors.ts); unknown values still capture.
        expected={
          rawErrorMessage !== null &&
          isExpectedAuthErrorPageMessage(rawErrorMessage)
        }
      />
    </>
  );
}
