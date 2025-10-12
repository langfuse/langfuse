import { ErrorPageWithSentry } from "@/src/components/error-page";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";

export default function AuthError() {
  const { t } = useTranslation();
  const router = useRouter();
  const { error } = router.query;
  const errorMessage = error
    ? decodeURIComponent(String(error))
    : t("auth.errors.authenticationErrorOccurred");

  return (
    <ErrorPageWithSentry
      title={t("auth.errors.authenticationError")}
      message={errorMessage}
    />
  );
}
