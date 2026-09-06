/**
 * Loading layout variant
 * Shown during session loading and authentication redirects
 */

import { Spinner } from "@/src/components/layouts/spinner";
import { useTranslations } from "next-intl";

type LoadingLayoutProps = {
  message?: string;
};

export function LoadingLayout({ message }: LoadingLayoutProps) {
  const t = useTranslations("sharedUi.common");

  return <Spinner message={message ?? t("loading")} />;
}
