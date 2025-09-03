import { useRouter } from "next/router";

export const usePeekExpandTraceDetail = () => {
  const router = useRouter();
  const { projectId, peek } = router.query;

  const expandPeek = (openInNewTab: boolean) => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const timestamp = params.get("timestamp");
    const display = params.get("display") ?? "details";

    const pathname = `/project/${projectId}/traces/${encodeURIComponent(peek as string)}?timestamp=${timestamp}&display=${display}`;

    if (openInNewTab) {
      const pathnameWithBasePath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${pathname}`;
      window.open(pathnameWithBasePath, "_blank");
    } else {
      router.push(pathname);
    }
  };

  return { expandPeek };
};
