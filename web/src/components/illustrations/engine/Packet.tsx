import { play, type Keyframes } from "./keyframes";
import styles from "./Scene.module.css";

/** A data packet travelling a wire on its generated keyframes, `at` ms into the run. */
export function Packet({
  keyframes,
  at,
}: {
  keyframes: Keyframes;
  at: number;
}) {
  return (
    <rect
      className={styles.packet}
      x={-2.5}
      y={-2.5}
      width={5}
      height={5}
      style={play(keyframes, at)}
    />
  );
}
