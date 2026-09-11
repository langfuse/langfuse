import { createStore } from "zustand/vanilla";
import { TechnoSynth } from "./audio";
import { DmxOutput } from "./dmx";
import {
  CLUB_SECONDS,
  STEP_SECONDS,
  sampleClubScore,
  roomChannels,
  type ClubScore,
} from "./model";
import { TowerScene } from "./scene";

type Transport = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekToSec: (seconds: number) => void;
  setPlaybackDuration: (seconds: number | null) => void;
  getPlayheadSec: () => number;
  getIsPlaying: () => boolean;
  subscribePlayback: (listener: (playing: boolean) => void) => () => void;
};

export class ClubRuntime {
  private static initialState(score: ClubScore) {
    return {
      error: "",
      lights: "disconnected" as "disconnected" | "connecting" | "connected",
      volume: 0.3,
      brightness: 0.65,
      dive: 0.35,
      kaleidoscope: 0.45,
      frame: sampleClubScore(score, 0),
    };
  }
  readonly state;
  private synth = new TechnoSynth();
  private dmx: DmxOutput | null = null;
  private audioTimer: ReturnType<typeof setInterval> | null = null;
  private command = 0;
  private disposed = false;
  private graphicsAvailable = true;
  private nextStep = 0;
  private audioOrigin = 0;

  constructor(
    readonly score: ClubScore,
    readonly transport: Transport,
  ) {
    this.state = createStore(() => ClubRuntime.initialState(score));
  }

  activate() {
    if (this.disposed) this.synth = new TechnoSynth();
    this.disposed = false;
  }

  async start() {
    if (this.disposed || !this.graphicsAvailable || this.score.duration <= 0)
      return;
    const command = ++this.command;
    this.state.setState({ error: "" });
    try {
      await this.synth.resume();
      if (this.disposed || command !== this.command) return;
      this.transport.setPlaybackDuration(CLUB_SECONDS);
      this.transport.play();
      const seconds =
        (this.transport.getPlayheadSec() / this.score.duration) * CLUB_SECONDS;
      this.nextStep = Math.ceil(seconds / STEP_SECONDS);
      this.audioOrigin = this.synth.currentTime + 0.035 - seconds;
      if (this.audioTimer !== null) clearInterval(this.audioTimer);
      this.audioTimer = setInterval(() => this.schedule(), 25);
      this.schedule();
      if (this.state.getState().lights === "disconnected") this.connectLights();
    } catch {
      if (this.disposed || command !== this.command) return;
      this.state.setState({
        error: "Audio could not start. Press Play to try again.",
      });
      this.pause();
    }
  }

  private schedule() {
    if (!this.transport.getIsPlaying()) {
      this.silence();
      return;
    }
    const now = this.synth.currentTime;
    const playSeconds =
      (this.transport.getPlayheadSec() / this.score.duration) * CLUB_SECONDS;
    // Re-anchor after a throttled frame; never schedule a burst of missed beats.
    if (Math.abs(now - this.audioOrigin - playSeconds) > 0.18) {
      this.synth.silence();
      const command = this.command;
      this.synth.resume().catch(() => {
        if (!this.disposed && command === this.command) this.pause();
      });
      this.audioOrigin = now + 0.035 - playSeconds;
      this.nextStep = Math.ceil(playSeconds / STEP_SECONDS);
    }
    while (this.audioOrigin + this.nextStep * STEP_SECONDS < now + 0.1) {
      const at = this.audioOrigin + this.nextStep * STEP_SECONDS;
      const traceSeconds =
        ((this.nextStep * STEP_SECONDS) / CLUB_SECONDS) * this.score.duration;
      if (at >= now && traceSeconds < this.score.duration) {
        this.synth.schedule(
          this.nextStep,
          at,
          sampleClubScore(this.score, traceSeconds),
        );
      }
      this.nextStep++;
    }
    const frame = sampleClubScore(this.score, this.transport.getPlayheadSec());
    this.dmx?.set(roomChannels(frame, this.state.getState().brightness));
  }

  pause() {
    this.command++;
    this.transport.pause();
    this.silence();
  }

  stop() {
    this.command++;
    this.transport.stop();
    this.silence();
  }

  exit() {
    this.stop();
    this.disconnectLights();
    this.transport.setPlaybackDuration(null);
    // The next dialog mount creates a fresh context after its Play gesture.
    this.graphicsAvailable = true;
  }

  seek(fraction: number) {
    this.pause();
    this.transport.seekToSec(
      Math.max(0, Math.min(1, fraction)) * this.score.duration,
    );
  }

  private silence() {
    if (this.audioTimer !== null) clearInterval(this.audioTimer);
    this.audioTimer = null;
    this.synth.silence();
    this.dmx?.blackout();
  }

  setVolume(volume: number) {
    this.synth.setVolume(volume);
    this.state.setState({ volume });
  }

  setBrightness(brightness: number) {
    this.state.setState({ brightness });
  }

  setView(name: "dive" | "kaleidoscope", value: number) {
    this.state.setState({ [name]: Math.max(0, Math.min(1, value)) });
  }

  async connectLights() {
    if (this.disposed || this.state.getState().lights !== "disconnected")
      return;
    this.state.setState({ lights: "connecting" });
    const dmx = new DmxOutput(() => {
      if (this.disposed || this.dmx !== dmx) return;
      this.disconnectLights();
      if (!this.graphicsAvailable) return;
      this.state.setState({
        error:
          "Room lighting disconnected. The music and visuals can keep playing.",
      });
    });
    this.dmx = dmx;
    try {
      await dmx.connect();
      if (this.disposed || this.dmx !== dmx) {
        dmx.close();
        return;
      }
      this.state.setState({
        lights: "connected",
        ...(this.graphicsAvailable ? { error: "" } : {}),
      });
    } catch {
      if (this.dmx !== dmx) return;
      this.disconnectLights();
      if (!this.graphicsAvailable) return;
      this.state.setState({
        error:
          "Room lighting is offline. Start the local DMX bridge, then reconnect.",
      });
    }
  }

  disconnectLights() {
    this.dmx?.close();
    this.dmx = null;
    this.state.setState({ lights: "disconnected" });
  }

  /** Canvas, visibility listener and transport subscription share this lifecycle. */
  attach(canvas: HTMLCanvasElement) {
    let scene: TowerScene;
    try {
      scene = new TowerScene(canvas, this.score);
      this.graphicsAvailable = true;
    } catch {
      this.graphicsAvailable = false;
      this.pause();
      this.state.setState({
        error:
          "WebGL 2 could not start. Enable hardware acceleration and reopen the show.",
      });
      return;
    }
    let raf = 0;
    let lastUiUpdate = 0;
    let contextLost = false;
    const draw = (timestamp: number) => {
      const frame = sampleClubScore(
        this.score,
        this.transport.getPlayheadSec(),
      );
      if (contextLost) return;
      const { dive, kaleidoscope } = this.state.getState();
      scene.render(frame, this.score, dive, kaleidoscope);
      if (timestamp - lastUiUpdate >= 100) {
        this.state.setState({ frame });
        lastUiUpdate = timestamp;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const unsubscribe = this.transport.subscribePlayback((playing) => {
      if (!playing) this.silence();
    });
    const hide = () => {
      if (document.hidden) this.pause();
    };
    const leave = () => this.stop();
    const loseContext = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      this.graphicsAvailable = false;
      cancelAnimationFrame(raf);
      this.pause();
      this.state.setState({
        error:
          "The graphics context was interrupted. Close and reopen the show to restore it.",
      });
    };
    canvas.addEventListener("webglcontextlost", loseContext);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      cancelAnimationFrame(raf);
      scene.dispose();
      unsubscribe();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      canvas.removeEventListener("webglcontextlost", loseContext);
    };
  }

  dispose() {
    this.disposed = true;
    this.exit();
    this.disconnectLights();
    this.synth.dispose();
  }
}
