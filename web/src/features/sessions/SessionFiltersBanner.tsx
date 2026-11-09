import { Button } from "@/src/components/design-system/Button/Button";

export function SessionFiltersBanner({
  onEdit,
  onClear,
}: {
  onEdit: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="status"
      className="bg-muted/40 text-muted-foreground flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
    >
      <span className="flex-1">
        Filters are active. Some session data may be hidden.
      </span>
      <Button variant="ghost" size="sm" text="Edit filters" onClick={onEdit} />
      <Button
        variant="ghost"
        size="sm"
        text="Clear filters"
        onClick={onClear}
      />
    </div>
  );
}
