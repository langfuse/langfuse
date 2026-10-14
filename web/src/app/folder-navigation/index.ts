// The folders feature's public client surface (RFC rule 8). Named
// re-exports only — breadcrumb helpers other features already imported
// by file path.
export { FolderBreadcrumb } from "@/src/app/folder-navigation/components/FolderBreadcrumb";
export { useFolderPagination } from "@/src/app/folder-navigation/hooks/useFolderPagination";
export {
  buildFullPath,
  createBreadcrumbItems,
} from "@/src/app/folder-navigation/utils";
