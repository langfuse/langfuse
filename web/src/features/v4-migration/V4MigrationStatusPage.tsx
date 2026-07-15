import Page from "@/src/components/layouts/page";

// Stub route target for the migration panel's "View migration status" button;
// the full status view (per-section tables, FAQ) lands with the backend work.
export default function V4MigrationStatusPage() {
  return (
    <Page headerProps={{ title: "Migration status" }}>
      <div className="p-4">
        <p className="text-muted-foreground text-sm">
          Detailed migration status for this project — tracing instrumentation,
          evals, APIs, and integrations — is coming soon.
        </p>
      </div>
    </Page>
  );
}
