import { chipHeight, chipWidth } from "./projection";
import styles from "./Scene.module.css";
import { SlotContent } from "./SlotContent";
import type { Slot } from "./slots";

type ChipProps = {
  /** Top-left corner. */
  x: number;
  y: number;
  slot: Slot;
  /** solid like a dark tag, soft like a light one, muted a light one with greyer text. */
  variant: "solid" | "soft" | "muted";
  fontSize: number;
  padX: number;
};

/** A tag with its text centred on it. */
export function Chip({ x, y, slot, variant, fontSize, padX }: ChipProps) {
  const height = chipHeight(fontSize);
  return (
    <g>
      <rect
        className={styles.chip}
        data-variant={variant}
        x={x}
        y={y}
        width={chipWidth(slot.text, fontSize, padX)}
        height={height}
      />
      <text
        className={styles.chipText}
        data-variant={variant}
        x={x + padX}
        y={y + height / 2 + fontSize * 0.36}
        style={{ fontSize }}
      >
        <SlotContent slot={slot} />
      </text>
    </g>
  );
}
