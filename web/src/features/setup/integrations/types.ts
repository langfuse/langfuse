/** One way to send traces to Langfuse, as langfuse-docs lists it. */
export type Integration = {
  slug: string;
  name: string;
  /** The id of its IntegrationCategory, e.g. `frameworks`. */
  category: string;
  /** The first sentence of the docs page's description. */
  description: string;
  /** Its docs page; the page's markdown is the same URL with `.md`. */
  href: string;
  /** The docs' logo for it, served by langfuse.com; `appearance` says which theme needs it inverted. */
  logo?: { src: string; appearance: "dark" | "light" | "color" };
};

export type IntegrationCategory = {
  id: string;
  title: string;
};
