import { signIn } from "next-auth/react";
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ErrorPageWithSentry } from "@/src/components/error-page";
import { Spinner } from "@/src/components/layouts/spinner";

export default function SSOInitiate() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for router to be ready
    if (!router.isReady) {
      return;
    }

    const provider = router.query.provider as string | undefined;

    // If provider is missing or empty, show error
    if (!provider || provider === "") {
      setError("No SSO provider specified. Please contact your administrator.");
      return;
    }

    // Automatically trigger sign-in with the provider
    signIn(provider)
      .then(() => {
        // signIn will redirect automatically on success
        // No need to do anything here
      })
      .catch((error) => {
        console.error("SSO initiation error:", error);
        setError(
          error instanceof Error
            ? error.message
            : "Failed to initiate SSO sign-in. Please try again or contact support.",
        );
      });
  }, [router.isReady, router.query.provider]);

  // Show error page if sign-in failed
  if (error) {
    return (
      <>
        <Head>
          <title>Sign-in Error | Langfuse</title>
        </Head>
        <ErrorPageWithSentry title="SSO Sign-in Failed" message={error} />
      </>
    );
  }

  // Show loading spinner while processing
  return (
    <>
      <Head>
        <title>Signing in | Langfuse</title>
      </Head>
      <Spinner message="Redirecting to your identity provider..." />
    </>
  );
}
