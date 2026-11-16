export declare const LANGFUSE_SKILLS: readonly {
  uri: string;
  frontmatter: {
    name: string;
    description: string;
    [key: string]: unknown;
  };
  resources: {
    path: string;
    uri: string;
    mimeType: string;
    digest: string;
    size: number;
    text: string;
  }[];
}[];

export declare const LANGFUSE_HALO_SKILLS: typeof LANGFUSE_SKILLS;
