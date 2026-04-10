export const spielwieseDesignSystem = {
  primitiveLibrary: "base",
  preset: "b1D0eCA7",
  style: "base-nova",
  baseColor: "slate",
  cssVariables: true,
  cssFile: "src/styles/globals.css",
  primitiveImplementationPath:
    "src/features/spielwiese/design-system/primitives",
  primitivePath: "src/features/spielwiese/ui",
} as const;

export type SpielwieseDesignSystem = typeof spielwieseDesignSystem;
