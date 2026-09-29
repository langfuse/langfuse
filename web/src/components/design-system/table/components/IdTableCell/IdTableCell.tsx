export function IdTableCell({ value }: { value: string }) {
  return (
    <div
      title={value}
      className="inline-block max-w-full overflow-hidden rounded py-0.5 text-xs text-nowrap text-ellipsis"
    >
      {value}
    </div>
  );
}
