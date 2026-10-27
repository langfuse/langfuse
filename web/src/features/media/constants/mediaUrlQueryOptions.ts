/**
 * Options every `media.getById` observer shares. Its observers read one cache
 * entry, and React Query applies the options of whichever observer rendered
 * last to it, so per-observer differences (retry, error toasts) would leak.
 */
export const mediaUrlQueryOptions = {
  meta: { silentHttpCodes: [404] },
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
  staleTime: 55 * 60 * 1000,
};
