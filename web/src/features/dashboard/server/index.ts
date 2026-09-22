// The dashboard feature's server surface (RFC rule 9, amended): the
// public dashboard services MCP tools already imported by file path.
export {
  addPublicDashboardPlacement,
  createPublicDashboard,
  deletePublicDashboard,
  deletePublicDashboardPlacement,
  getPublicDashboard,
  listPublicDashboards,
  updatePublicDashboard,
  updatePublicDashboardPlacement,
} from "@/src/features/dashboard/server/public-dashboard-service";
