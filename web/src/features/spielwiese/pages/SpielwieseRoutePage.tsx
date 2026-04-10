import SpielwieseDashboardPage from "./SpielwieseDashboardPage";
import SpielwieseOnboardingPage from "./SpielwieseOnboardingPage";

type SpielwieseRoutePageProps = {
  slug?: string[];
};

export function getSpielwieseRoute(slug?: string[]) {
  return slug?.[0] === "onboarding" ? "onboarding" : "dashboard";
}

export default function SpielwieseRoutePage({
  slug,
}: SpielwieseRoutePageProps) {
  return getSpielwieseRoute(slug) === "onboarding" ? (
    <SpielwieseOnboardingPage stepId={slug?.[1]} />
  ) : (
    <SpielwieseDashboardPage />
  );
}
