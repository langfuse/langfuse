export const routeRevealCss = `
@keyframes spielwiese-route-snapshot-crossfade {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.spielwiese-route-transition-stage {
  isolation: isolate;
  min-height: 100%;
  position: relative;
  width: 100%;
}

.spielwiese-route-transition-live {
  min-height: 100%;
  position: relative;
  width: 100%;
  z-index: 2;
}

.spielwiese-route-transition-stage[data-route-transition-phase="sweeping"] [role="progressbar"],
.spielwiese-route-transition-stage[data-route-transition-phase="revealing"] [role="progressbar"] {
  display: none;
}

.spielwiese-route-transition-snapshot {
  contain: layout paint;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  position: absolute;
  z-index: 1;
}

.spielwiese-route-transition-snapshot[data-route-transition-phase="revealing"] {
  animation: spielwiese-route-snapshot-crossfade 420ms cubic-bezier(0.4, 0, 0.2, 1)
    both;
}

.spielwiese-route-transition-snapshot-inner {
  min-height: 100%;
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .spielwiese-route-transition-snapshot[data-route-transition-phase="revealing"] {
    animation-duration: 1ms;
  }
}
`;
