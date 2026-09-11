import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import { useStore } from "zustand";
import {
  Pause,
  Play,
  Square,
  Radio,
  Volume2,
  Lightbulb,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import {
  DialogController,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { useTraceData } from "../contexts/TraceDataContext";
import { useIsPlaying, usePlayhead } from "../contexts/PlayheadContext";
import { ClubPlaybackContext } from "./context";
import { ClubRuntime } from "./runtime";
import { CLUB_BPM, CLUB_SECONDS, prepareClubScore } from "./model";
import styles from "./club.module.css";

export function TraceClub({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { trace } = useTraceData();
  return router.query.club === "1" ? (
    <EnabledClub key={trace.id}>{children}</EnabledClub>
  ) : (
    children
  );
}

function EnabledClub({ children }: { children: ReactNode }) {
  const { roots, traceStartTime, traceDuration, trace } = useTraceData();
  const transport = usePlayhead();
  const [runtime] = useState(
    () =>
      new ClubRuntime(
        prepareClubScore(roots, traceStartTime, traceDuration, trace.id),
        transport,
      ),
  );
  // The imperative audio graph and DMX connection belong to this trace mount.
  useEffect(() => {
    runtime.activate();
    return () => runtime.dispose();
  }, [runtime]);
  return (
    <DialogController
      size="xxl"
      closeOnInteractionOutside={false}
      onDismiss={() => runtime.exit()}
      renderContent={() => <ClubStage runtime={runtime} />}
    >
      {({ openDialog }) => (
        <ClubPlaybackContext.Provider
          value={() => {
            openDialog();
            runtime.start();
          }}
        >
          {children}
        </ClubPlaybackContext.Provider>
      )}
    </DialogController>
  );
}

function ClubStage({ runtime }: { runtime: ClubRuntime }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [immersive, setImmersive] = useState(false);
  const playing = useIsPlaying();
  const frame = useStore(runtime.state, (state) => state.frame);
  const volume = useStore(runtime.state, (state) => state.volume);
  const brightness = useStore(runtime.state, (state) => state.brightness);
  const lights = useStore(runtime.state, (state) => state.lights);
  const error = useStore(runtime.state, (state) => state.error);
  const dive = useStore(runtime.state, (state) => state.dive);
  const kaleidoscope = useStore(runtime.state, (state) => state.kaleidoscope);
  // ResizeObserver, canvas RAF, browser visibility and transport listeners.
  useEffect(() => {
    if (canvas.current) return runtime.attach(canvas.current);
  }, [runtime]);
  const elapsed = Math.floor(frame.progress * CLUB_SECONDS);
  const time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const active = frame.active[frame.active.length - 1];
  return (
    <div
      className={`${styles.club} ${immersive ? styles.immersive : ""} ph-no-capture`}
    >
      <DialogHeader>
        <DialogTitle>
          <span className={styles.title}>TRACE / CLUB</span>
        </DialogTitle>
        <DialogDescription>
          La procédure devient matière. La matière devient son.
        </DialogDescription>
      </DialogHeader>
      <div className={styles.stage}>
        <canvas
          ref={canvas}
          className={styles.canvas}
          aria-label="Three-dimensional Eiffel towers choreographed by the current trace"
        />
        <button
          className={styles.expand}
          type="button"
          aria-label={
            immersive ? "Leave immersive view" : "Enter immersive view"
          }
          onClick={() => setImmersive(!immersive)}
        >
          {immersive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        {immersive && (
          <DialogClose className={styles.exit} aria-label="Close club">
            <X size={16} />
          </DialogClose>
        )}
        <div className={styles.topline}>
          <span>
            <i className={playing ? styles.live : styles.idle} />{" "}
            {playing ? "LIVE FROM THE TRACE" : "TRANSPORT PAUSED"}
          </span>
          <span>
            {CLUB_BPM} BPM <b> / </b> PARIS → BERLIN
          </span>
        </div>
        <div className={styles.sideLabel}>RÉPUBLIQUE DES MACHINES</div>
        <div className={styles.caption}>
          <span className={styles.eyebrow}>
            {frame.section} · {frame.stageLabel}
          </span>
          <strong>
            ÉTAT
            <br />
            DE TRANSE
          </strong>
          <span className={styles.subtitle}>
            {frame.articleLabel || "Le poids de la procédure."}
          </span>
        </div>
        <div className={styles.readout}>
          <div>
            <span>ACTIVE SPANS</span>
            <strong>{String(frame.active.length).padStart(2, "0")}</strong>
          </div>
          <div>
            <span>TRACE DEPTH</span>
            <strong>{String(frame.depth).padStart(2, "0")}</strong>
          </div>
          <div>
            <span>PRESSION</span>
            <strong>
              {Math.round(frame.bureaucracy * 100)}
              <small>%</small>
            </strong>
          </div>
        </div>
        <div className={styles.lens}>
          <label>
            <span>IMMERSION</span>
            <input
              aria-label="Camera immersion"
              type="range"
              min="0"
              max="100"
              value={dive * 100}
              onChange={(event) =>
                runtime.setView("dive", Number(event.target.value) / 100)
              }
            />
          </label>
          <label>
            <span>KALEIDOSCOPE</span>
            <input
              aria-label="Kaleidoscope intensity"
              type="range"
              min="0"
              max="100"
              value={kaleidoscope * 100}
              onChange={(event) =>
                runtime.setView(
                  "kaleidoscope",
                  Number(event.target.value) / 100,
                )
              }
            />
          </label>
          <span className={styles.gesture}>
            DRAG TO ORBIT · SCROLL TO DIVE · DOUBLE-CLICK TO RESET
          </span>
        </div>
        <div className={styles.current}>
          <span>{active?.type ?? "TRACE"}</span>
          <p>{active?.name ?? "Waiting for the next observation"}</p>
        </div>
      </div>
      <div className={styles.console}>
        <label className={styles.scrubber}>
          <span className="sr-only">Trace playback position</span>
          <input
            type="range"
            min="0"
            max="1000"
            value={Math.round(frame.progress * 1000)}
            onChange={(event) =>
              runtime.seek(Number(event.target.value) / 1000)
            }
          />
        </label>
        <div className={styles.controls}>
          <div className={styles.transport}>
            <Button
              variant="secondary"
              size="icon"
              aria-label={
                playing ? "Pause club playback" : "Play club playback"
              }
              onClick={() => {
                if (playing) runtime.pause();
                else runtime.start();
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Stop club playback"
              onClick={() => runtime.stop()}
            >
              <Square size={14} />
            </Button>
            <span className={styles.time}>
              {time} <b>/ 1:56</b>
            </span>
          </div>
          <label className={styles.level}>
            <Volume2 size={15} />
            <span>GAIN</span>
            <input
              aria-label="Music volume"
              type="range"
              min="0"
              max="100"
              value={volume * 100}
              onChange={(event) =>
                runtime.setVolume(Number(event.target.value) / 100)
              }
            />
          </label>
          <label className={styles.level}>
            <Lightbulb size={15} />
            <span>ROOM</span>
            <input
              aria-label="Room brightness"
              type="range"
              min="0"
              max="100"
              value={brightness * 100}
              onChange={(event) =>
                runtime.setBrightness(Number(event.target.value) / 100)
              }
            />
          </label>
          <button
            type="button"
            className={styles.connection}
            disabled={lights === "connecting"}
            onClick={() =>
              lights === "connected"
                ? runtime.disconnectLights()
                : runtime.connectLights()
            }
          >
            <Radio size={14} />
            {lights === "connected"
              ? "DMX CONNECTED"
              : lights === "connecting"
                ? "CONNECTING…"
                : "CONNECT ROOM"}
          </button>
        </div>
        {error && (
          <p role="status" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.footer}>
          <span>LE DROIT GRAVÉ DANS LE MÉTAL. LE RYTHME DANS LE CORPS.</span>
          <span>
            {runtime.score.observations.length} OBSERVATIONS · 49 SOLID TOWERS
          </span>
        </div>
      </div>
    </div>
  );
}
