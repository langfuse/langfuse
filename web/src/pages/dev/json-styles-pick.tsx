import { JsonStylePickPage } from "@/src/features/json-style-review/JsonStylePickPage";

// Dev-only pick between the three finalist JSON table directions; renders
// "Not available" in production unless the debug pick is stored (same guard
// as the toggle and /dev/json-styles).
export default function JsonStylesPickPage() {
  return <JsonStylePickPage />;
}
