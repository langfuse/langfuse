import { JsonStyleReviewPage } from "@/src/features/json-style-review/JsonStyleReviewPage";

// Dev-only review of the JSON table style directions; renders "Not available"
// in production unless the debug pick is stored (same guard as the toggle).
export default function JsonStylesPage() {
  return <JsonStyleReviewPage />;
}
