// The setup feature's public surface (RFC rule 8). Named re-exports
// only — route helpers other features already imported by file path.
// This module is React-free, so server callers use the same door.
export {
  createOrganizationRoute,
  createProjectRoute,
  setupTracingRoute,
} from "@/src/features/setup/setupRoutes";
