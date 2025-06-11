import type * as React from "react";

declare namespace JSX {
  interface IntrinsicElements {
    "stripe-pricing-table": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}

// Fallback module declarations for packages without explicit type definitions
// This prevents TS errors like "Could not find a declaration file for module ..."
declare module "react-icons/*";
declare module "@radix-ui/react-*";
declare module "@tremor/react";
declare module "react";
