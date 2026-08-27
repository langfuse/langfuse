// The catalog moved to the domain layer (client-safe data, no server deps);
// re-exported here so server-side callers keep their import path.
export * from "../../../domain/table-view-presets-catalog";
