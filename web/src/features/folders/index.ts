// The folders feature's public client surface (RFC rule 8). Named
// re-exports only — breadcrumb helpers other features already imported
// by file path.
export { FolderBreadcrumb } from "@/src/features/folders/components/FolderBreadcrumb";
export { useFolderPagination } from "@/src/features/folders/hooks/useFolderPagination";
export {
  buildFullPath,
  createBreadcrumbItems,
} from "@/src/features/folders/utils";
