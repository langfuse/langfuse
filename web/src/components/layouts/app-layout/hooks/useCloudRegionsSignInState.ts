import {
  type RegionKey,
  type getAvailableCloudRegionOptions,
} from "@/src/features/organizations/cloudRegions";
import { useEffect, useState } from "react";

type RegionsState = Partial<
  Record<
    RegionKey,
    | "idle"
    | "unknowable"
    | "loading"
    | "signedIn"
    | "signedOut"
    | "aborted"
    | "failed"
  >
>;

// Checks the sign-in status for each available cloud region and returns an object with the results
export const useCloudRegionsSignInState = (
  regions: ReturnType<typeof getAvailableCloudRegionOptions>,
  enabled = process.env.NODE_ENV === "production",
) => {
  const [signedInRegions, setSignedInRegions] = useState<RegionsState>(() =>
    regions.reduce(
      (acc, region) => ({
        ...acc,
        [region.name as RegionKey]: region.rootUrl ? "idle" : "unknowable",
      }),
      {} satisfies RegionsState,
    ),
  );

  const setRegionStatus = (
    regionName: RegionKey,
    status: RegionsState[RegionKey],
  ) =>
    setSignedInRegions((prev) => ({
      ...prev,
      [regionName]: status,
    }));

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();

    regions.forEach((region) => {
      if (!region.rootUrl) {
        return;
      }

      setRegionStatus(region.name, "loading");

      fetch(`${region.rootUrl}/api/auth/session`, {
        credentials: "include",
        mode: "cors",
        signal: abortController.signal,
      })
        .then((response) => response.json())
        .then((data) => {
          setRegionStatus(
            region.name,
            isSignedInSession(data) ? "signedIn" : "signedOut",
          );
        })
        .catch((error) => {
          if (error.name === "AbortError") {
            return setRegionStatus(region.name, "aborted");
          }

          setRegionStatus(region.name, "failed");
        });
    });

    return () => {
      abortController.abort();
    };
    // Use JSON.stingify to compare regions array deeply
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(regions), enabled]);

  return signedInRegions;
};

export const isSignedInSession = (session: unknown) => {
  return !!session && typeof session === "object" && "user" in session;
};
