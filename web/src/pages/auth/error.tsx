import { ErrorPage } from "@/src/components/error-page";
import { useRouter } from "next/router";

export default function AuthError() {
  const router = useRouter();
  const { error } = router.query;
  const errorMessage = error
    ? decodeURIComponent(String(error))
    : "An authentication error occurred. Please reach out to support.";

  return <ErrorPage title="Authentication Error" message={errorMessage} />;
}
