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
