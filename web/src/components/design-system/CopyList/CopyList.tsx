import { CopyIconButton } from "../CopyIconButton/CopyIconButton";

type CopyListItem = {
  /** The name, e.g. `LANGFUSE_PUBLIC_KEY`. */
  label: string;
  /** What the row's button copies. */
  value: string;
  /** Shown in place of the value, e.g. a masked secret; the button still copies `value`. */
  displayValue?: string;
};

type CopyListProps = {
  /** The id of the visible heading that names the list, e.g. the one reading "Put your keys in .env". */
  labelledBy: string;
  items: CopyListItem[];
  /** Runs after a row's copy lands, with that row's label, e.g. to mark a step done. */
  onCopy: (label: string) => void;
};

/** Name and value pairs on one panel, each row with its own copy button; long values end in an ellipsis and show in full on hover. Below 28rem the name sits above its value. */
export function CopyList({ labelledBy, items, onCopy }: CopyListProps) {
  return (
    <dl
      role="group"
      aria-labelledby={labelledBy}
      className="bg-surface-section @container grid gap-px rounded-md p-1 font-mono text-xs"
    >
      {items.map((item) => {
        const shown = item.displayValue ?? item.value;
        return (
          <div
            key={item.label}
            className="hover:bg-background/60 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-sm py-0.5 pr-0.5 pl-2 @md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
          >
            <dt
              className="text-foreground-secondary col-span-full truncate @md:col-span-1"
              title={item.label}
            >
              {item.label}
            </dt>
            <dd
              className="ph-no-capture text-foreground truncate"
              title={shown}
            >
              {shown}
            </dd>
            <dd>
              <CopyIconButton
                label={`Copy ${item.label}`}
                value={item.value}
                size="sm"
                onCopy={() => onCopy(item.label)}
              />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
