export const buildResizableImageSrc = ({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) => {
  if (!width || !quality) return src;

  const separator = src.includes("?") ? "&" : "?";

  return `${src}${separator}w=${width}&q=${quality || 75}`;
};
