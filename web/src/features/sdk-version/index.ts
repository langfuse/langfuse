// The sdk-version feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// Server callers of getSdkVersionCapabilityStatus use server/index.ts
// so they do not load the React hook on this door.
export { useProjectSdkVersionInfo } from "@/src/features/sdk-version/hooks/useProjectSdkVersionInfo";
export {
  getSdkVersionCapability,
  getSdkVersionCapabilityStatus,
  toSdkVersionInfo,
  type SdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
export { clearProjectSdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionStorage";
