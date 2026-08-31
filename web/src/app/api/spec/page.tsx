import type { Metadata } from "next";

import { ApiReference } from "./ApiReference";

export const metadata: Metadata = {
  title: "Langfuse API Reference",
};

export default function ApiSpecPage() {
  return <ApiReference />;
}
