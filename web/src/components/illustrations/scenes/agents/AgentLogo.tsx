import type { IconComponent } from "@langfuse/icons";
import { SiClaude, SiOpenai } from "@langfuse/icons/si";
import { round, type Rect } from "../../engine/projection";
import styles from "./agents.module.css";
import type { AgentLogo as AgentLogoName } from "./content";

/** The icon set's `lg` size, which an icon mark is drawn at and then scaled from. */
const ICON_SIZE = 20;

/**
 * Each agent's mark and its size in plan units, sized by eye to read alike beside the name: its icon from the icon
 * set, or its shape on a small grid.
 */
const MARKS: Record<AgentLogoName, Mark> = {
  claude: {
    kind: "icon",
    tone: "claude",
    width: 22,
    height: 22,
    Icon: SiClaude,
  },
  openai: { kind: "icon", tone: "ink", width: 20, height: 20, Icon: SiOpenai },
  // OpenCode's frame, its lower half filled in grey
  opencode: {
    kind: "shape",
    tone: "ink",
    width: 13.6,
    height: 17,
    grid: "0 0 4 5",
    paths: [
      { d: "M0 0H4V5H0ZM1 1V4H3V1Z" },
      { d: "M1 2H3V4H1Z", isMuted: true },
    ],
  },
  // Pi's blocky π
  pi: {
    kind: "shape",
    tone: "ink",
    width: 16,
    height: 16,
    grid: "0 0 4 4",
    paths: [{ d: "M0 0H3V2H2V3H1V4H0ZM1 1V2H2V1Z" }, { d: "M3 2H4V4H3Z" }],
  },
};

type AgentLogoProps = {
  logo: AgentLogoName;
  /** The block's slot for it, where `>_` sits otherwise: the mark is centred in it. */
  slot: Rect;
};

/** A coding agent's mark on its block, in its own colours. */
export function AgentLogo({ logo, slot }: AgentLogoProps) {
  const mark = MARKS[logo];
  return (
    <svg
      className={styles.mark}
      data-tone={mark.tone}
      x={round(slot.x + (slot.width - mark.width) / 2)}
      y={round(slot.y + (slot.height - mark.height) / 2)}
      width={mark.width}
      height={mark.height}
      viewBox={
        mark.kind === "icon" ? `0 0 ${ICON_SIZE} ${ICON_SIZE}` : mark.grid
      }
      fill="currentColor"
      aria-hidden="true"
    >
      {mark.kind === "icon" ? (
        <mark.Icon size="lg" aria-hidden="true" />
      ) : (
        mark.paths.map(({ d, isMuted }) => (
          <path
            key={d}
            d={d}
            fillRule="evenodd"
            className={isMuted ? styles.muted : undefined}
          />
        ))
      )}
    </svg>
  );
}

type Mark = { tone: "claude" | "ink"; width: number; height: number } & (
  | { kind: "icon"; Icon: IconComponent }
  | { kind: "shape"; grid: string; paths: { d: string; isMuted?: boolean }[] }
);
