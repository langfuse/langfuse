// Client-safe entry of the in-app-agent module. Server code must never be
// re-exported here — this barrel is imported by web client components and is
// covered by the client-bundle scan.
export * from "./schema";
export * from "./approvalEvents";
export * from "./constants";
export * from "./interrupts";
export * from "./messages";
export * from "../features/inAppAgent/types";
