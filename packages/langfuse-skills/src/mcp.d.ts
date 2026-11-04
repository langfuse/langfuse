export declare const LANGFUSE_MCP_SKILLS: readonly {
  uri: string;
  frontmatter: {
    name: string;
    description: string;
    [key: string]: unknown;
  };
  resources: { uri: string; digest: string; size: number }[];
}[];

export declare const LANGFUSE_MCP_RESOURCES: readonly ({
  uri: string;
  mimeType: string;
} & ({ text: string; blob?: never } | { blob: string; text?: never }))[];
