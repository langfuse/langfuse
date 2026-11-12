import { Tag } from "@/src/components/design-system/Tag/Tag";

type ModelPatternTagProps = {
  pattern: string;
  onRemove: (pattern: string) => void;
};

/** Exclude patterns, which start with `-`, read as errors so they stand out from includes. */
export function ModelPatternTag({ pattern, onRemove }: ModelPatternTagProps) {
  const handleRemove = () => onRemove(pattern);

  return (
    <Tag
      text={pattern}
      status={pattern.startsWith("-") ? "error" : "default"}
      remove={{ onRemove: handleRemove }}
    />
  );
}
