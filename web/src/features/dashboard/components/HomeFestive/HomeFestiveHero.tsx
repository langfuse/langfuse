"use client";

import {
  createContext,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";

import styles from "@/src/features/dashboard/components/HomeFestive/HomeFestive.module.css";
import { PixelSprite } from "@/src/features/dashboard/components/HomeFestive/PixelSprite";
import {
  BOX_SNOW,
  BOX_SNOW_HEIGHT,
  DEER_STAND,
  DEER_WALK,
  FESTIVE_PALETTE,
  GIFT_SCALE,
  SACK,
  SANTA_A,
  SANTA_B,
  SNOW_BLOCK,
  TREE,
  giftStyle,
} from "@/src/features/dashboard/components/HomeFestive/sprites";
import { cn } from "@/src/utils/tailwind";

const MAX_GIFTS = 12;
const FALL_MS = 900;
const TICK_MS = 90;
const SANTA_WIDTH = 36;
const SANTA_HEIGHT = 42;
// How far above the hero's bottom edge Santa stands.
const SANTA_LIFT = 8;
const SANTA_STEP = 10;
const SANTA_RISE_STEP = 12;
// Ticks Santa stands still after the last present before he leaves.
const SANTA_PAUSE_TICKS = 5;
// How far from Santa's edges a landed present still goes into the sack.
const SANTA_REACH = 30;

// A click on any of these is the user using the page, not dropping a present.
const INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, label, summary, [role='button'], [role='link'], [role='menuitem'], [contenteditable='true']";

type Gift = {
  id: number;
  kind: number;
  x: number;
  centerX: number;
  /** Distance it falls to the hero's bottom edge. */
  drop: number;
  landAt: number;
  hasLanded: boolean;
};

type Santa = {
  x: number;
  /** Walking direction; the sack trails on the other side. */
  direction: -1 | 1;
  frame: 0 | 1;
  sack: number;
  /** How far he is still sunk into the snowbank. */
  rise: number;
  idleTicks: number;
};

type Scene = {
  gifts: Gift[];
  nextGiftId: number;
  /** Presents that have landed so far; each one makes the reindeer hop. */
  landings: number;
  santa: Santa | null;
};

type SceneAction =
  | {
      type: "drop";
      centerX: number;
      top: number;
      now: number;
      sceneWidth: number;
      sceneHeight: number;
    }
  | { type: "tick"; now: number; sceneWidth: number };

const EMPTY_SCENE: Scene = {
  gifts: [],
  nextGiftId: 1,
  landings: 0,
  santa: null,
};

// Santa comes up from the hero's bottom edge with his sack right under the
// falling present, facing the side he will leave by.
function spawnSanta(giftCenterX: number, sceneWidth: number): Santa {
  const direction = giftCenterX < sceneWidth / 2 ? -1 : 1;

  return {
    x: direction === -1 ? giftCenterX - 43 : giftCenterX + 7,
    direction,
    frame: 0,
    sack: 0,
    rise: SANTA_HEIGHT + SNOW_BLOCK,
    idleTicks: 0,
  };
}

function moveSanta(
  santa: Santa,
  gifts: Gift[],
  sceneWidth: number,
): { santa: Santa | null; gifts: Gift[] } {
  if (santa.rise > 0) {
    return {
      santa: { ...santa, rise: Math.max(0, santa.rise - SANTA_RISE_STEP) },
      gifts,
    };
  }

  let sack = santa.sack;
  const remaining = gifts.filter((gift) => {
    const isInReach =
      gift.centerX >= santa.x - SANTA_REACH &&
      gift.centerX <= santa.x + SANTA_WIDTH + SANTA_REACH;

    if (gift.hasLanded && isInReach) {
      sack += 1;
      return false;
    }

    return true;
  });
  const nextFrame = santa.frame === 0 ? 1 : 0;
  const target = remaining[0];

  if (target) {
    const distance = target.centerX - SANTA_WIDTH / 2 - santa.x;

    if (Math.abs(distance) <= SANTA_REACH) {
      return { santa: { ...santa, sack, idleTicks: 0 }, gifts: remaining };
    }

    const direction = distance < 0 ? -1 : 1;

    return {
      santa: {
        ...santa,
        sack,
        direction,
        x: santa.x + direction * SANTA_STEP,
        frame: nextFrame,
        idleTicks: 0,
      },
      gifts: remaining,
    };
  }

  if (santa.idleTicks < SANTA_PAUSE_TICKS) {
    return {
      santa: { ...santa, sack, idleTicks: santa.idleTicks + 1 },
      gifts: remaining,
    };
  }

  // Leaves by the nearer edge, decided once when he sets off.
  let direction = santa.direction;
  if (santa.idleTicks === SANTA_PAUSE_TICKS) {
    direction = santa.x + SANTA_WIDTH / 2 < sceneWidth / 2 ? -1 : 1;
  }
  const x = santa.x + direction * SANTA_STEP;

  if (x < -80 || x > sceneWidth + 40) {
    return { santa: null, gifts: remaining };
  }

  return {
    santa: {
      ...santa,
      sack,
      direction,
      x,
      frame: nextFrame,
      idleTicks: santa.idleTicks + 1,
    },
    gifts: remaining,
  };
}

function reduceScene(scene: Scene, action: SceneAction): Scene {
  if (action.type === "drop") {
    const kind = scene.nextGiftId - 1;
    const style = giftStyle(kind);
    const restingTop = action.sceneHeight - style.height;
    const gift: Gift = {
      id: scene.nextGiftId,
      kind,
      x: Math.round(action.centerX - style.width / 2),
      centerX: action.centerX,
      drop: Math.max(0, Math.round(restingTop - action.top)),
      landAt: action.now + FALL_MS,
      hasLanded: false,
    };

    return {
      ...scene,
      nextGiftId: scene.nextGiftId + 1,
      gifts: [...scene.gifts, gift].slice(-MAX_GIFTS),
      santa: scene.santa ?? spawnSanta(action.centerX, action.sceneWidth),
    };
  }

  const justLanded = scene.gifts.filter(
    (gift) => !gift.hasLanded && action.now >= gift.landAt,
  ).length;
  const gifts =
    justLanded === 0
      ? scene.gifts
      : scene.gifts.map((gift) =>
          action.now >= gift.landAt ? { ...gift, hasLanded: true } : gift,
        );

  if (!scene.santa) {
    return { ...scene, gifts, landings: scene.landings + justLanded };
  }

  const moved = moveSanta(scene.santa, gifts, action.sceneWidth);

  return {
    ...scene,
    gifts: moved.gifts,
    santa: moved.santa,
    landings: scene.landings + justLanded,
  };
}

// Number of presents landed so far, for the reindeer on the Ask box.
const LandingsContext = createContext(0);

/**
 * Home's hero with the seasonal pixel scene around its content. Clicking any
 * empty spot drops a present, and Santa comes up from the bottom edge to
 * pack it.
 */
export function HomeFestiveHero({ children }: { children: ReactNode }) {
  const heroRef = useRef<HTMLDivElement>(null);
  const [scene, dispatch] = useReducer(reduceScene, EMPTY_SCENE);
  const isAnimating = scene.santa !== null || scene.gifts.length > 0;

  const dropAtPointer = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      !(event.target instanceof Element) ||
      event.target.closest(INTERACTIVE_SELECTOR) ||
      window.getSelection()?.toString()
    ) {
      return;
    }

    const heroRect = event.currentTarget.getBoundingClientRect();

    dispatch({
      type: "drop",
      centerX: event.clientX - heroRect.left,
      top: event.clientY - heroRect.top - 14,
      now: Date.now(),
      sceneWidth: heroRect.width,
      sceneHeight: heroRect.height,
    });
  };

  useEffect(() => {
    if (!isAnimating) {
      return;
    }

    const timer = window.setInterval(() => {
      dispatch({
        type: "tick",
        now: Date.now(),
        sceneWidth: heroRef.current?.clientWidth ?? 0,
      });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [isAnimating, heroRef]);

  return (
    <LandingsContext.Provider value={scene.landings}>
      <div
        ref={heroRef}
        onClick={dropAtPointer}
        className="relative flex flex-1 flex-col justify-center overflow-hidden py-18"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {scene.gifts.map((gift) => {
            const style = giftStyle(gift.kind);

            return (
              <span
                key={gift.id}
                className={cn(styles.drop, "absolute")}
                style={
                  {
                    left: gift.x,
                    bottom: 0,
                    "--festive-drop": `${-gift.drop}px`,
                  } as CSSProperties
                }
              >
                <PixelSprite
                  map={style.map}
                  scale={GIFT_SCALE}
                  palette={style.palette}
                />
              </span>
            );
          })}
          {scene.santa ? (
            <span
              className="absolute"
              style={{
                left: scene.santa.x,
                bottom: SANTA_LIFT - scene.santa.rise,
              }}
            >
              <span
                className="absolute"
                style={
                  scene.santa.direction === -1
                    ? { left: 34, bottom: SNOW_BLOCK }
                    : { right: 34, bottom: SNOW_BLOCK }
                }
              >
                <PixelSprite
                  map={SACK}
                  scale={2 + Math.min(scene.santa.sack, 3)}
                  palette={FESTIVE_PALETTE}
                />
              </span>
              <PixelSprite
                map={scene.santa.frame === 0 ? SANTA_A : SANTA_B}
                scale={3}
                palette={FESTIVE_PALETTE}
              />
            </span>
          ) : null}
        </div>
        <div className="relative">{children}</div>
      </div>
    </LandingsContext.Provider>
  );
}

/** "Ask Halo" with the ring-topped tree standing in for the "a". */
function HomeFestiveTitle() {
  return (
    <span>
      <span className="sr-only">Ask Halo</span>
      <span
        aria-hidden
        className="inline-flex items-baseline text-[2rem] font-bold"
      >
        Ask H
        <span className="mx-px">
          <PixelSprite map={TREE} scale={3} palette={FESTIVE_PALETTE} />
        </span>
        lo
      </span>
    </span>
  );
}

// Alternates between two identical animations, so each landing restarts it.
function hopClassName(landings: number) {
  if (landings === 0) {
    return undefined;
  }

  return landings % 2 ? styles.hopA : styles.hopB;
}

function WalkingDeer({
  restingLeft,
  delaySeconds,
  landings,
}: {
  /** Where it stands when motion is reduced; the walk overrides it. */
  restingLeft: string;
  delaySeconds: number;
  /** Presents landed so far; each new one makes it hop. */
  landings: number;
}) {
  return (
    <span
      className={cn(styles.walk, "absolute")}
      style={{
        left: restingLeft,
        bottom: BOX_SNOW_HEIGHT,
        animationDelay: `${delaySeconds}s`,
      }}
    >
      <span className={cn("block", hopClassName(landings))}>
        <span className="relative block" style={{ width: 48, height: 39 }}>
          <span className={cn(styles.frameA, "absolute inset-0")}>
            <PixelSprite map={DEER_STAND} scale={3} palette={FESTIVE_PALETTE} />
          </span>
          <span className={cn(styles.frameB, "absolute inset-0")}>
            <PixelSprite map={DEER_WALK} scale={3} palette={FESTIVE_PALETTE} />
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * Snow and two walking reindeer for the top edge of the Ask box. Goes
 * directly above the box, inside a `HomeFestiveHero`.
 */
function HomeFestiveBoxTop() {
  const landings = useContext(LandingsContext);

  return (
    <div
      aria-hidden
      className="pointer-events-none relative h-14 overflow-x-clip"
    >
      <span className="absolute bottom-0 left-0">
        <PixelSprite
          map={BOX_SNOW}
          scale={SNOW_BLOCK}
          palette={FESTIVE_PALETTE}
        />
      </span>
      <WalkingDeer restingLeft="22%" delaySeconds={0} landings={landings} />
      <WalkingDeer restingLeft="64%" delaySeconds={-16} landings={landings} />
    </div>
  );
}

HomeFestiveHero.Title = HomeFestiveTitle;
HomeFestiveHero.BoxTop = HomeFestiveBoxTop;
