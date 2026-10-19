// Tracing-tables front door — selection stores + legacy ObservationsTable.
// ObservationsPage is deliberately absent: the Next.js route imports it
// directly (same pattern as TracePage / SessionsPage).
export { default as ObservationsTable } from "@/src/features/tracing-tables/observations/ObservationsTable";
