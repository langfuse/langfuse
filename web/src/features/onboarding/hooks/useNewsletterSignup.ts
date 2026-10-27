import { useQuery } from "@tanstack/react-query";
import {
  checkLangfuseReachable,
  subscribeToNewsletter,
} from "../lib/newsletterSignup";

/** Checks once per page load whether the browser reaches langfuse.com and exposes the signup call. */
export function useNewsletterSignup() {
  // The query function never rejects, so no global error toast can fire.
  const reachabilityCheck = useQuery({
    queryKey: ["onboarding", "newsletterReachability"],
    queryFn: checkLangfuseReachable,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return {
    reachability: getReachability(reachabilityCheck.data),
    subscribe: subscribeToNewsletter,
  };
}

const getReachability = (
  isReachable: boolean | undefined,
): "checking" | "reachable" | "unreachable" => {
  if (isReachable === undefined) return "checking";
  return isReachable ? "reachable" : "unreachable";
};
