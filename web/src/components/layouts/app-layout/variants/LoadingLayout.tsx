/**
 * Loading layout variant
 * Shown during session loading and authentication redirects
 */

import { Spinner } from "@/src/components/layouts/Spinner";

type LoadingLayoutProps = {
  message?: string;
};

export function LoadingLayout({ message = "Loading" }: LoadingLayoutProps) {
  return <Spinner message={message} />;
}
