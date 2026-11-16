import styles from "./Scene.module.css";

/** A status dot and its soft halo, in the tone of the `data-tone` around it. */
export function StatusDot({
  x,
  y,
  r = 3.6,
  halo = 6,
}: {
  x: number;
  y: number;
  r?: number;
  halo?: number;
}) {
  return (
    <>
      <circle className={styles.halo} cx={x} cy={y} r={halo} />
      <circle className={styles.toned} cx={x} cy={y} r={r} />
    </>
  );
}
