import { useRouter } from "next/router";

export default function useTableNameFromURL() {
  const router = useRouter();
  return router.route.split("/")[3];
}
