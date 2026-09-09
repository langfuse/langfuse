// The notifications feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported, nothing
// added for the future.
//
// Settings components stay a page-level deep import. Intra-feature modules
// (`ErrorNotification`, `SuccessNotification`, hooks) stay internal.

export { showErrorToast } from "@/src/features/notifications/showErrorToast";
export { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
