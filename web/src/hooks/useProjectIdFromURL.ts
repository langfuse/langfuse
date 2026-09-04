import { useRouter } from "next/router";
import { asSingleQueryParam } from "@/src/hooks/useReadyRouteParams";

export default function useProjectIdFromURL() {
  const router = useRouter();

  return asSingleQueryParam(router.query.projectId);
}
