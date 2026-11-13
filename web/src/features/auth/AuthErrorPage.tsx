import { ErrorPageWithSentry } from "@/src/components/error-page";
import { isExpectedAuthErrorPageMessage } from "@/src/features/auth/lib/expectedAuthErrors";
import { useRouter } from "next/router";

export default function AuthErrorPage() {
  const router = useRouter();
  const { error } = router.query;
  // Note: Next.js already URL-decodes router.query values, so do not decode
  // again here: a literal "%" in the message (e.g. "100% complete") makes
  // decodeURIComponent throw URIError and blanks the error page.
  const errorMessage = error
    ? String(error)
    : "An authentication error occurred. Please reach out to support.";

  return (
    <ErrorPageWithSentry
      title="Authentication Error"
      message={errorMessage}
      // Expired magic links and deliberate SSO-domain rejections are expected
      // outcomes (see expectedAuthErrors.ts); unknown values still capture.
      expected={
        error !== undefined && isExpectedAuthErrorPageMessage(errorMessage)
      }
    />
  );
}
