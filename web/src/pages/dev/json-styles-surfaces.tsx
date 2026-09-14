import { JsonStyleSurfacesPage } from "@/src/features/json-style-review/JsonStyleSurfacesPage";

// Dev-only index of every product surface that renders the JSON table, with
// deep links into seeded data; renders "Not available" in production unless
// the debug pick is stored (same guard as /dev/json-styles).
export default function JsonStylesSurfacesPage() {
  return <JsonStyleSurfacesPage />;
}
