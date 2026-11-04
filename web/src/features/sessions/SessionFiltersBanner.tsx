import { Button } from "@/src/components/design-system/Button/Button";

export function SessionFiltersBanner({
  onEdit,
  onClear,
  onSave,
  hasFilters = true,
}: {
  onEdit: () => void;
  onClear: () => void;
  onSave?: () => void;
  hasFilters?: boolean;
}) {
  return (
    <div
      role="status"
      className="bg-muted/40 text-muted-foreground flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-1 text-sm"
    >
      <span className="flex-1">
        {hasFilters
          ? "Filters are active. Some session data may be hidden."
          : "You are viewing a custom session view."}
      </span>
      <Button variant="ghost" size="sm" text="Edit filters" onClick={onEdit} />
      <Button
        variant="ghost"
        size="sm"
        text="Clear filters"
        onClick={onClear}
      />
      {onSave && (
        <Button variant="ghost" size="sm" text="Save view" onClick={onSave} />
      )}
    </div>
  );
}
