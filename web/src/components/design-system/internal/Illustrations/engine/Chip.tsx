import { charWidth } from "./projection";
import styles from "./Scene.module.css";
import { SlotContent } from "./SlotContent";
import type { Slot } from "./slots";

type ChipProps = {
  /** Top-left corner. */
  x: number;
  y: number;
  slot: Slot;
  /** solid like a dark tag, soft like a light one. */
  tone: "solid" | "soft";
  fontSize: number;
  padX: number;
};

export const chipWidth = (text: string, fontSize: number, padX: number) =>
  [...text].length * charWidth(fontSize) + 2 * padX;

/** A tag with its text centred on it. */
export function Chip({ x, y, slot, tone, fontSize, padX }: ChipProps) {
  const height = Math.round(fontSize * 1.45);
  return (
    <g>
      <rect
        className={styles.chip}
        data-tone={tone}
        x={x}
        y={y}
        width={chipWidth(slot.text, fontSize, padX)}
        height={height}
      />
      <text
        className={styles.chipText}
        data-tone={tone}
        x={x + padX}
        y={y + height / 2 + fontSize * 0.36}
        style={{ fontSize }}
      >
        <SlotContent slot={slot} />
      </text>
    </g>
  );
}
