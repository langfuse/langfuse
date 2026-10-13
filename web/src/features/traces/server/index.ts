// The traces feature's server surface (RFC rule 9, amended): the legacy
// IO-search guard batch jobs already imported by file path.
export {
  assertLegacyTracingIoSearchCanCreateBatchJob,
  sanitizeLegacyTracingSearch,
} from "@/src/features/traces/server/legacyIoSearch";
