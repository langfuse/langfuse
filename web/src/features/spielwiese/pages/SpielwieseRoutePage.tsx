import SpielwieseIntroPage from "./SpielwieseIntroPage";
import SpielwieseDashboardPage from "./SpielwieseDashboardPage";
import SpielwieseOnboardingPage from "./SpielwieseOnboardingPage";

type SpielwieseRoutePageProps = {
  slug?: string[];
};

export function getSpielwieseRoute(slug?: string[]) {
  if (slug?.[0] === "onboarding") {
    return "onboarding";
  }

  if (slug?.[0] === "dashboard") {
    return "dashboard";
  }

  return "intro";
}

export default function SpielwieseRoutePage({
  slug,
}: SpielwieseRoutePageProps) {
  const route = getSpielwieseRoute(slug);

  if (route === "onboarding") {
    return <SpielwieseOnboardingPage stepId={slug?.[1]} />;
  }

  if (route === "dashboard") {
    return <SpielwieseDashboardPage />;
  }

  return <SpielwieseIntroPage />;
}
