import { useRouter } from "next/router";

// This url is deprecated, we keep this redirect page for backward compatibility
export default function EvalConfigsConfigRedirectPage() {
  const router = useRouter();
  if (router.isFallback) {
    return <div className="p-3">Loading...</div>;
  }

  return <div>Redirecting...</div>;
}
