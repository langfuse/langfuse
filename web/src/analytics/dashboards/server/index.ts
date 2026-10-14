// The dashboard feature's server surface (RFC rule 9, amended): the
// public dashboard services MCP tools already imported by file path.
export {
  getWidgetImportFilterConfig,
  partitionStoredUiTableFiltersToView,
} from "@/src/analytics/dashboards/lib/dashboardUiTableToViewMapping";
export {
  addPublicDashboardPlacement,
  createPublicDashboard,
  deletePublicDashboard,
  deletePublicDashboardPlacement,
  getPublicDashboard,
  listPublicDashboards,
  updatePublicDashboard,
  updatePublicDashboardPlacement,
} from "@/src/analytics/dashboards/server/public-dashboard-service";
