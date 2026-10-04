// The navigate-detail-pages feature's public client surface (RFC rule 8).
// Named re-exports only — exactly what other features already imported.
export {
  DetailPageListsProvider,
  detailPageListKeys,
  useDetailPageLists,
  useFirstDetailPageListEntry,
  type EventDetailPageListEntry,
  type ListEntry,
  type ObservationDetailPageListEntry,
  type TraceDetailPageListEntry,
} from "@/src/features/navigate-detail-pages/context";
export { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
