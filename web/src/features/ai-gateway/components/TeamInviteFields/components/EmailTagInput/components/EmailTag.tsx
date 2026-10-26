import { Tag } from "@/src/components/design-system/Tag/Tag";

export type EmailTagProps = {
  email: string;
  invalid: boolean;
  onRemove: (email: string) => void;
};

export function EmailTag({ email, invalid, onRemove }: EmailTagProps) {
  function handleRemove() {
    onRemove(email);
  }

  return (
    <Tag
      text={email}
      status={invalid ? "error" : "default"}
      remove={{ onRemove: handleRemove }}
    />
  );
}
