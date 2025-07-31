export function generateSyntheticUsername({
  name,
  tag,
}: {
  name: string;
  tag: string;
}) {
  return `SYNTH_${name}_${tag}`;
}

export function generateSnapshotUsername({
  name,
  sessionNumber, // s9
  turnNumber, // t1
}: {
  name: string;
  sessionNumber: string;
  turnNumber: string;
}) {
  return `SNAP_${name}_${sessionNumber}_${turnNumber}`;
}
