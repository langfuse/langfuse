import { Button } from "@/src/components/design-system/Button/Button";

export function SessionFiltersBanner({
  onEdit,
  onClear,
  onSave,
  message,
}: {
  onEdit: () => void;
  onClear?: () => void;
  onSave?: () => void;
  message: string;
}) {
  return (
    <div
      role="status"
      className="bg-muted/40 text-muted-foreground flex shrink-0 flex-wrap items-center gap-2 border-b py-1 pr-2 pl-4 text-sm"
    >
      <span className="flex-1">{message}</span>
      <Button variant="ghost" size="sm" text="Edit filters" onClick={onEdit} />
      {onClear && (
        <Button
          variant="ghost"
          size="sm"
          text="Clear filters"
          onClick={onClear}
        />
      )}
      {onSave && (
        <Button variant="ghost" size="sm" text="Save view" onClick={onSave} />
      )}
    </div>
  );
}
