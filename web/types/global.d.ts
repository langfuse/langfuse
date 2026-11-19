declare namespace JSX {
  interface IntrinsicElements {
    "stripe-pricing-table": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}

declare module "*.svg" {
  import type { StaticImageData } from "next/image";
  const content: StaticImageData;

  export default content;
}

declare module "*.png" {
  import type { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}

declare module "*.jpg" {
  import type { StaticImageData } from "next/image";
  const content: StaticImageData;
  export default content;
}

declare module "*.md" {
  const content: string;
  export default content;
}

// Vite raw-text imports (Storybook): used by the Theme Tokens gallery to
// parse src/styles/globals.css at build time.
declare module "*.css?raw" {
  const content: string;
  export default content;
}
