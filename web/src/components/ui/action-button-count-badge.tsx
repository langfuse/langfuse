export function ActionButtonCountBadge({ count }: { count: number }) {
  return (
    <span className="bg-primary/50 text-primary-foreground flex h-3.5 w-fit items-center justify-center rounded-sm px-1 text-xs shadow-xs">
      {count > 99 ? "99+" : count}
    </span>
  );
}
