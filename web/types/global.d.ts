declare namespace JSX {
  interface IntrinsicElements {
    "stripe-pricing-table": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}

declare module "*.svg" {
  const content: {
    src: string;
    height: number;
    width: number;
    blurDataURL?: string;
  };

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
