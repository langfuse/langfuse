# Trace Club

Local development experiment: add `club=1` to a trace URL, select Timeline,
then use its existing Play button. A trace becomes a 64-bar, 132 BPM
performance (about 116 seconds). Pause, Stop, scrubbing, closing the dialog,
and hiding the tab stop audio and blackout the room.

## Owners

- `TraceClub.tsx`: development-only opt-in, dialog, transport and controls.
- `runtime.ts`: audio scheduling, DMX output, canvas and browser lifecycle.
- `model.ts`: pure trace-to-performance preparation and sampling.
- `scene.ts`: Three.js WebGL 2 scene, 49 instanced solid models, moving camera,
  96 floating inscriptions, 2,200 particles, bloom and a kaleidoscope lens.
- `tower-geometry.ts`: procedural Eiffel model with solid lattice legs, open
  arches, balconies and antenna; 14,212 triangles, shared across all instances.
- `shaders.ts`: flowing metal, iridescent edges, trace inscription atlas,
  procedural tunnel, curved document surfaces, particles and chromatic lens.
- `audio.ts`: native Web Audio oscillators, envelopes, synthesized noise,
  distortion, filters, delays, sidechain and compression. No audio files.
- `dmx.ts`: browser transport to the explicitly started loopback bridge.
- `scripts/trace-club/dmx_bridge.py`: ENTTEC serial ownership and watchdog.

The existing per-trace playhead remains the transport authority. Club mode
sets an optional presentation duration and restores normal timing on close.
The score captures the loaded trace when club mode mounts; reload to include
subsequently ingested observations. Seeking pauses and reproduces the same
trace-dependent arrangement at the selected position.

Generations open the acid filter; repeated tools build pressure and add
industrial stamp/clank percussion; concurrent observations raise energy;
nesting changes the orbit and lens symmetry; warning/error observations add
red and tension. Concurrent verification creates suspended chords and folds
the visual field. The trace ID fixes the bass tonic while span IDs vary rhythm
and timbre. The 64-bar arrangement includes rolling Reese bass, a tuned kick
and sub, acid slides, shuffling hats, fills, a breakdown and a second drop.
Agentique's `legifrance.*` SPANs have a derived tool role while retaining their
original observation type. Observed names and explicit article references
(such as `verify.L3121-16`) become the actual texture atlas. French phase
labels describe observed workflow activity, not legal conclusions. Source
input/output payloads never enter the score.

Drag the scene to orbit, scroll to dive, and double-click to reset the camera.
Immersion controls camera distance; Kaleidoscope controls the folding lens.
The expand button fills the browser viewport. Rendering and audio both use
the trace playhead, so seeking reproduces the same choreography. Closing
disposes model buffers, textures, materials, render targets and listeners.
WebGL context loss pauses audio and blacks out DMX; reopen the show to recover.

The renderer uses [Three.js instancing](https://threejs.org/docs/pages/InstancedMesh.html)
and [post-processing](https://threejs.org/manual/en/post-processing.html).
The inscription atlas is drawn locally; there are no model or texture downloads.

No new product analytics: this is a local experiment, and existing transport
events already record the user action. Expected audio/DMX availability errors
render in the dialog without sending Sentry events.

See [local setup](../../../../../scripts/trace-club/README.md) for hardware,
Agentique runs and verified trace links.
