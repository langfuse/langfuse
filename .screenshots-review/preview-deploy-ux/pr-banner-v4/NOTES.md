# Preview PR banner strip — round 4 (tokens + storybook)

Final approved design re-implemented as theme tokens (--preview-banner*)
in :root and .dark per theme-changes-both-modes; dark values precompose
blue-500/25 and blue-300/20 over the 6% canvas so the strip has an opaque
fill. Component split into a pure PreviewDeploymentBannerView (+ stories)
and a thin env/context container.

1. `1-final-tokens-light.png` — token version, light (matches round-3 pick).
2. `2-final-tokens-dark.png` — token version, dark (matches approved 25% wash).

Computed styles verified: light bg ≈ blue-100, text = blue-950, link ≈ blue-700;
dark bg rgb(26,43,71) ≈ blue-500/25 over #0f0f0f, link ≈ blue-400.
