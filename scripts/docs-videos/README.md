# Docs videos

Scripted, re-runnable recordings of the Langfuse UI for the short looping
videos on langfuse.com docs (`<Video ... gifStyle />`).

Each scene seeds its own data, signs in as the demo user, drives the real app
with Playwright, and records hi-DPI frames plus a camera and cursor timeline.
`render.mjs` turns that into a 1920x1080, 60fps H.264 MP4 with eased zoom/pan
and a composited cursor.

Framing follows the `product-screenshot-capture` skill
(langfuse-internal-skills): 16:9, 1920x1080 at 125% zoom, icon-rail
navigation, a `GENERATION` selected where one fits, no transient UI at rest.

## Run

Prereqs: dev infra up, migrations applied, and the web app on
`http://localhost:3000`. For clean footage, start it with
`LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=false` and without
`NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` (hides "Internal" tabs and the region
badge).

```bash
cd scripts/docs-videos
pnpm install
pnpm exec playwright install chromium
node share-trace.mjs         # -> out/share-trace-frames/ + .timeline.json
node render.mjs share-trace  # -> out/share-trace.mp4
```

Upload the MP4 to `static.langfuse.com/docs-videos/` and point the docs
`<Video src>` at it with `aspectRatio={16 / 9}`. Pass the scene's `title` and
`description` from `descriptions.json` too: they label the player and are
printed in the docs' Markdown export, so readers and browser agents that
cannot watch the video still learn the UI path. Update the entry whenever a
scene changes.

## Writing a scene

Copy `share-trace.mjs`. Use `seed()` for data, `glideTo` / `glideClick` for
cursor movement, and `focus(box, zoom)` / `wide()` to set where the camera has
arrived at that moment; the renderer eases between keyframes. Do all setup
(navigation, selection, resets) before `record()` so takes start on the
final frame state with no dead time.

How it works, and why:

- **Capture.** `page.screencast` with `onFrame` delivers JPEG frames with
  wall-clock timestamps; the renderer holds each frame until the next, so
  timing is exact. Writing the screencast to a file instead yields fixed
  25fps WebM.
- **Resolution.** Frames come out in CSS pixels unless Chromium is launched
  with `--force-device-scale-factor`; `lib.mjs` captures at 2x the output so
  camera zooms stay sharp.
- **Cursor.** Drawn in post from the recorded glide curves, not on the page:
  capture frame rate dips while the app re-renders, which made an on-page
  cursor stutter. The real pointer still lands on each target, so hover and
  click states are genuine. Click ripples are drawn on the page.
- **Camera.** ffmpeg `zoompan` (constant frame size) on a 2x-upsampled source,
  so slow zooms do not step.
- Scenes may change data (e.g. make a trace public); reset that state before
  `record()` so takes are repeatable.
