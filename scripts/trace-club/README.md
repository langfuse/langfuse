# Local Trace Club

From the Langfuse checkout:

```sh
pnpm run dev
python3 scripts/trace-club/dmx_bridge.py
```

Use the existing dev processes if already running. The DMX bridge requires
Python 3 and the connected ENTTEC DMX USB PRO; no additional package or driver.
It owns `/dev/cu.usbserial-EN492597`, listens on `127.0.0.1:9097`, and accepts
only the browser origin `http://localhost:3000`.

The fixture is at address 1: R, G, B, W, A, UV. The full universe is sent at
40 Hz; this scene leaves UV off. Startup, shutdown, Stop and a 750 ms client
timeout blackout the fixture. Only one application can own the serial port.

```sh
python3 scripts/trace-club/dmx_bridge.py --probe-only
python3 -m unittest discover -s scripts/trace-club -p 'test_*.py'
```

Sign in at `http://localhost:3000` using the existing synthetic account
`demo@langfuse.com` / `password`, then open either real Agentique trace:

- [Contravention question — 41 observations](http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/traces/38e21d6b-1e39-405c-b44b-d7c5d704dab5?view=timeline&club=1)
- [Work-break question — 25 observations](http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/traces/2d21aa8d-fc46-44a3-9bb5-6db405648258?view=timeline&club=1)

Press the timeline's Play button. The club opens and starts the synth, tower
scene and connected light together. Gain and Room independently adjust volume
and light intensity. Escape closes the club and stops the performance.

This is a desktop development mode. In a narrow desktop panel, Play is under
More options. The demo account uses the supported v3 trace preference: this
checkout's local v4 compatibility query encountered an evaluator alias error.
The local ClickHouse database was advanced through the existing migrations
47 and 48; no tables were reset or truncated.

## Agentique

The two traces came from real `answerTurn()` calls in `~/code/agentique`, on
2026-09-07, using its native Langfuse and Braintrust sinks. Both answered with
two verified citations; the first includes an optional skeptic-stage failure.
The source question and returned answer are visible in the trace.

For another run, use Agentique's existing `pnpm smoke '<question>'` command.
Override `LANGFUSE_BASE_URL=http://localhost:3000` and supply this local
project's `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` in process environment.
Do not use its configured cloud project keys against the local instance.
The native smoke runner flushes both instrumentation sinks and uses session
`smoke`. Its model and legal-source credentials remain in Agentique's setup.

Verification artifacts for this session live in `/tmp/trace-club-agentique-verified.json`
and `/tmp/playwright-mcp/trace-club-audio-verify.js`. No external issue or pull
request was created for this local experiment.

## Implementation decisions

The timeline's existing clock drives the show. Ordinary playback keeps its
10-second maximum; club playback stretches or compresses the loaded trace to
64 bars. The 3D geometry and all sound are synthesized locally. The USB bridge
is separate from Next.js and has explicit session/sequence ordering so a late
frame cannot override a blackout. No agent or hardware credentials enter the
browser bundle.

Run targeted checks with:

```sh
pnpm --filter web run test-client src/features/traces/club src/features/traces/stores/playheadStore.clienttest.ts src/features/traces/components/PlaybackControls.clienttest.tsx
pnpm run lint
pnpm run typecheck
pnpm exec knip
```

## Verified WebGL playback

The upgraded show uses 49 instanced solid Eiffel models (14,212 triangles
per model), a trace inscription atlas, procedural metal/tunnel/document/particle
shaders, multisample rendering, bloom and a kaleidoscope lens. Repeated legal
lookups drive mechanical percussion and amber pressure; overlapping verification
changes harmony, cyan lighting and mirror geometry. Actual article identifiers
appear in the texture and phase caption.

Drag to orbit, scroll to dive, and double-click to reset. Immersion adjusts the
camera and Kaleidoscope adjusts the lens; 100% produces a complete radial mirror.
The expand button fills the browser viewport. Escape or Close ends the show.

On the local Apple M5 Pro browser, 150 live frames averaged 16.67 ms; maximum
17.7 ms, no frames above 33 ms. The reviewed run delivered 1,208 successful DMX
frames with zero failed bridge responses. Pause, seek, end-of-trace, Stop,
close/reopen and real WebGL context loss were exercised. Context loss blacks out
DMX and refuses playback until reopening; the opening Play gesture recovers
without an extra click. GPU pixel hashes confirmed a paused frame stays stable,
drag/wheel alter the view, and double-click restores the original frame.
The 900×800 browser has a 855×720 dialog with no overflow.

Artifacts:

- `/tmp/trace-club-webgl-v2.webm`: 16.50 seconds of actual WebGL and synthesized
  stereo audio, VP9 + Opus, 1512×863. Recorded audio peak: −12.34 dBFS;
  no NaN/Inf samples.
- `/tmp/trace-club-webgl-v2.png`: immersive UI with real ARTICLE 530 activity.
- `/tmp/trace-club-v2-mandala.png`: full kaleidoscope.
- `/tmp/trace-club-v2-compact.png`: compact desktop.
- `/tmp/trace-club-analog-v2.wav`: separate 23.8-second native synth diagnostic.

Check summaries:

- Client: `Tests 40 passed (40)`; reopening regression first failed
  `Tests 1 failed | 6 passed (7)` before the fix.
- Native audio: `passed: 14` detailed renders and `passed: 8` lifecycle cases.
  Full 64-bar render including tail: 118.36s, max 53 voices, 0 leaked.
  Maximum-volume peak: 0.7616; drop/breakdown RMS ratio: 3.53.
- Lint: `Tasks: 7 successful, 7 total`; `Cached: 5 cached, 7 total`.
- Knip and `git diff --check`: exit 0.
- Full typecheck: `Tasks: 7 successful, 8 total`; `Cached: 6 cached, 8 total`.
  Seven existing cross-package Prisma type identity errors remain in prompt
  cache, eval and auth code. Web uses the TypeScript 7 dependency variant while
  shared uses the TypeScript 6 catalog variant. Installation exposed stale
  generated clients; regenerating both restored runtime operation but their
  separate runtime type identities still conflict. No club-file diagnostics.
  Log: `/tmp/trace-club-v2-typecheck-final.log`.

The unchanged bridge and CSP retain the first version's passing checks:
`Ran 11 tests in 0.003s` / `OK`, and `Tests 3 passed (3)`. They were not rerun
for this graphics/audio upgrade. The production build was skipped because the
show is a development-only local experiment. No external issue or PR was created.
