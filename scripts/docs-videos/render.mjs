// Turns out/<name>-frames/ + out/<name>.timeline.json into a docs-ready 60fps
// H.264 MP4 with an eased zoom/pan camera. Usage: node render.mjs <name>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { CURSOR_TIP, OUT_DIR } from "./lib.mjs";

const name = process.argv[2];
if (!name) throw new Error("usage: node render.mjs <scene-name>");
const OUT_W = 1920;
const FPS = 60;
// zoompan crops on whole source pixels; upsampling first keeps slow pans and
// zooms from stepping visibly.
const SUPERSAMPLE = 2;
/** On-screen size of the cursor's 32px art box, in output pixels. */
const CURSOR_PX = 100;
/** Longest camera move between two keyframes, in seconds. */
const CAMERA_MOVE_S = 1;

const { viewport, scale, duration, frames, keyframes, cursor } = JSON.parse(
  fs.readFileSync(path.join(OUT_DIR, `${name}.timeline.json`), "utf8"),
);

// The screencast only emits frames on change; the concat list holds each one
// until the next, so on-screen timing matches the recording exactly.
const framesDir = path.join(OUT_DIR, `${name}-frames`);
const concat = frames
  .map((f, i) => {
    const next = frames[i + 1]?.t ?? duration;
    return `file '${f.file}'\nduration ${Math.max(next - f.t, 0.001).toFixed(4)}`;
  })
  .join("\n");
const concatFile = path.join(framesDir, "frames.txt");
fs.writeFileSync(concatFile, `${concat}\nfile '${frames.at(-1).file}'\n`);
const OUT_H = Math.round((OUT_W * viewport.height) / viewport.width / 2) * 2;
const cam = keyframes.map((k) => ({
  t: k.t,
  z: k.zoom,
  cx: k.x + k.width / 2,
  cy: k.y + k.height / 2,
}));

// Piecewise smoothstep between keyframes, as an ffmpeg expression of `t`.
function track(key, t = "it") {
  let expr = cam.at(-1)[key].toFixed(3);
  for (let i = cam.length - 2; i >= 0; i--) {
    const a = cam[i];
    const b = cam[i + 1];
    // Hold the previous framing and move only in the last CAMERA_MOVE_S before
    // a keyframe, so a long gap between keyframes is a hold, not a drift.
    const start = Math.max(a.t, b.t - CAMERA_MOVE_S);
    const d = Math.max(b.t - start, 0.001);
    const k = `clip((${t}-${start.toFixed(3)})/${d.toFixed(3)},0,1)`;
    const seg = `(${a[key].toFixed(3)}+(${(b[key] - a[key]).toFixed(3)})*${k}*${k}*(3-2*${k}))`;
    expr = `if(lt(${t},${b.t.toFixed(3)}),${seg},${expr})`;
  }
  return expr;
}

// Cursor position in CSS px: holds between glides, eased quadratic Bezier
// during each one (same curve as lib.mjs records).
function cursorTrack(axis, t = "t") {
  const { start, glides } = cursor;
  let expr = (glides.at(-1)?.to ?? start)[axis].toFixed(2);
  for (let i = glides.length - 1; i >= 0; i--) {
    const g = glides[i];
    const before = (i === 0 ? start : glides[i - 1].to)[axis].toFixed(2);
    const k = `clip((${t}-${g.t0.toFixed(3)})/${Math.max(g.t1 - g.t0, 0.001).toFixed(3)},0,1)`;
    const e = `if(lt(${k},0.5),4*pow(${k},3),1-pow(2-2*${k},3)/2)`;
    const bez = `(pow(1-${e},2)*${g.from[axis].toFixed(2)}+2*(1-${e})*${e}*${g.ctrl[axis].toFixed(2)}+pow(${e},2)*${g.to[axis].toFixed(2)})`;
    expr = `if(lt(${t},${g.t0.toFixed(3)}),${before},if(lt(${t},${g.t1.toFixed(3)}),${bez},${expr}))`;
  }
  return expr;
}

// zoompan keeps a constant frame size (scale+crop with eval=frame does not);
// x/y are the top-left of the visible window in source pixels.
const [Z, CX, CY] = ["z", "cx", "cy"].map((key) => track(key));
const camera = [
  `fps=${FPS}`,
  `scale=iw*${SUPERSAMPLE}:ih*${SUPERSAMPLE}:flags=lanczos`,
  `zoompan=z='${Z}':x='clip((${CX})*${scale * SUPERSAMPLE}-iw/zoom/2,0,iw-iw/zoom)':y='clip((${CY})*${scale * SUPERSAMPLE}-ih/zoom/2,0,ih-ih/zoom)':d=1:fps=${FPS}:s=${OUT_W}x${OUT_H}`,
].join(",");

// Same camera window in CSS px, evaluated on the output clock, to place the
// cursor where zoompan put the page.
const [z, cx, cy] = ["z", "cx", "cy"].map((key) => track(key, "t"));
const { width: VW, height: VH } = viewport;
const left = `clip((${cx})-${VW}/(2*(${z})),0,${VW}-${VW}/(${z}))`;
const top = `clip((${cy})-${VH}/(2*(${z})),0,${VH}-${VH}/(${z}))`;
const px = OUT_W / VW;
const tip = CURSOR_PX / CURSOR_TIP.box;
const overlayX = `((${cursorTrack("x")})-${left})*(${z})*${px}-${(CURSOR_TIP.x * tip).toFixed(2)}`;
const overlayY = `((${cursorTrack("y")})-${top})*(${z})*${px}-${(CURSOR_TIP.y * tip).toFixed(2)}`;
const graph = [
  `[0:v]${camera}[page]`,
  `[1:v]scale=${CURSOR_PX}:${CURSOR_PX}:flags=lanczos,format=rgba[cursor]`,
  `[page][cursor]overlay=x='${overlayX}':y='${overlayY}':eval=frame:shortest=1,format=yuv420p`,
].join(";");

const output = path.join(OUT_DIR, `${name}.mp4`);
execFileSync(
  ffmpeg,
  [
    ...["-hide_banner", "-loglevel", "error", "-y"],
    ...["-f", "concat", "-safe", "0", "-i", concatFile],
    ...["-loop", "1", "-i", path.join(OUT_DIR, "cursor.png")],
    ...["-filter_complex", graph],
    ...[
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "20",
      "-tune",
      "animation",
    ],
    ...["-movflags", "+faststart", "-an", output],
  ],
  { stdio: "inherit" },
);
// A take's 4K frames run to hundreds of MB; keep them only when asked
// (KEEP_FRAMES=1), e.g. to re-render a camera change without re-recording.
if (!process.env.KEEP_FRAMES) {
  fs.rmSync(framesDir, { recursive: true, force: true });
}
console.log(
  `${output} (${OUT_W}x${OUT_H}) -> <Video aspectRatio={16 / 9} gifStyle />`,
);
