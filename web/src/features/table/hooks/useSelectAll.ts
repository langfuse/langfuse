import useSessionStorage from "@/src/components/useSessionStorage";
import { useRouter } from "next/router";
import { useEffect } from "react";

export function useSelectAll(projectId: string, tableName: string) {
  const router = useRouter();
  // Read initial value from session storage
  const storageKey = `selectAll-${projectId}-${tableName}`;
  const initialValue =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem(storageKey) === "true"
      : false;

  const [selectAll, setSelectAll] = useSessionStorage<boolean>(
    storageKey,
    initialValue,
  );

  useEffect(() => {
    const handleRouteChange = () => {
      setSelectAll(false);
    };

    router.events.on("routeChangeStart", handleRouteChange);

    return () => {
      router.events.off("routeChangeStart", handleRouteChange);
    };
  }, [router.events, setSelectAll]);

  return { selectAll, setSelectAll };
}
