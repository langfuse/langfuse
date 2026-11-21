/** One string per row, one character per pixel, "." is transparent. */
export type PixelMap = readonly string[];
export type PixelPalette = Readonly<Record<string, string>>;

export const FESTIVE_PALETTE: PixelPalette = {
  b: "rgb(185 122 87)",
  d: "rgb(120 70 40)",
  k: "rgb(0 0 0)",
  r: "rgb(237 28 36)",
  R: "rgb(150 10 25)",
  w: "rgb(255 255 255)",
  s: "rgb(195 195 195)",
  g: "rgb(34 177 76)",
  G: "rgb(14 110 50)",
  y: "rgb(255 201 14)",
  u: "rgb(63 72 204)",
  p: "rgb(255 205 175)",
  S: "rgb(238 246 252)",
  E: "rgb(190 214 232)",
};

const GIFT_BLUE_PALETTE: PixelPalette = {
  ...FESTIVE_PALETTE,
  r: "rgb(63 72 204)",
  y: "rgb(255 255 255)",
};

export const DEER_STAND: PixelMap = [
  "...........d.d..",
  "...........dd...",
  "............d.d.",
  "...........bbb..",
  "...........bkbbk",
  "..........bbbb..",
  "..........bb....",
  ".bbbbbbbbbbb....",
  "bbbbbbbbbbbb....",
  ".bbbbbbbbbbb....",
  ".b.b.....b.b....",
  ".b.b.....b.b....",
  ".k.k.....k.k....",
];

export const DEER_WALK: PixelMap = [
  ...DEER_STAND.slice(0, 10),
  "..b.b...b...b...",
  ".b...b...b.b....",
  ".k...k...k.k....",
];

// Topped with Halo's ring instead of a star.
export const TREE: PixelMap = [
  "...yyyyy...",
  "..y.....y..",
  "...yyyyy...",
  "...........",
  ".....g.....",
  "....ggg....",
  "...ggrgg...",
  "....ggg....",
  "...gGggg...",
  "..ggygggg..",
  "...ggggg...",
  "..gggggrg..",
  ".ggGggggGg.",
  "gggygggrggg",
  "....ddd....",
  "....ddd....",
];

export const SANTA_A: PixelMap = [
  ".......w....",
  "....rrrr....",
  "...rrrrr....",
  "..wwwwwww...",
  "..pkppkpp...",
  "..wwwwwwww..",
  "..wwwwwwww..",
  ".rrrwwwwrrr.",
  "rrrrrwwrrrrr",
  "rrrrkkkkrrrr",
  "rrrrkykkrrrr",
  ".rrrrrrrrrr.",
  "..rrr..rrr..",
  "..kkk..kkk..",
];

export const SANTA_B: PixelMap = [
  ...SANTA_A.slice(0, 12),
  ".rrr....rrr.",
  ".kkk....kkk.",
];

export const SACK: PixelMap = [
  "..dd..",
  ".dddd.",
  "dddddd",
  "dddddd",
  "dddddd",
  ".dddd.",
];

const GIFT_RED: PixelMap = [
  "..y.y...",
  "...y....",
  "rrryrrrr",
  "rrryrrrr",
  "yyyyyyyy",
  "rrryrrrr",
  "rrryrrrr",
];

const GIFT_GREEN: PixelMap = [
  ".r..r.",
  "..rr..",
  "ggrggg",
  "rrrrrr",
  "ggrggg",
  "ggrggg",
];

export const GIFT_SCALE = 4;

type GiftStyle = {
  map: PixelMap;
  palette: PixelPalette;
  width: number;
  height: number;
};

const RED_GIFT: GiftStyle = {
  map: GIFT_RED,
  palette: FESTIVE_PALETTE,
  width: 32,
  height: 28,
};

const GIFT_STYLES: readonly GiftStyle[] = [
  RED_GIFT,
  { map: GIFT_GREEN, palette: FESTIVE_PALETTE, width: 24, height: 24 },
  { map: GIFT_RED, palette: GIFT_BLUE_PALETTE, width: 32, height: 28 },
];

/** Red, green, blue, then round again. */
export function giftStyle(kind: number): GiftStyle {
  return GIFT_STYLES[kind % GIFT_STYLES.length] ?? RED_GIFT;
}

export const SNOW_BLOCK = 6;

function pseudoRandom(index: number, seed: number) {
  const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

// Snow columns of the given heights, each topped with one edge pixel.
function snowMap(heights: readonly number[], rows: number): PixelMap {
  return Array.from({ length: rows }, (_, row) => {
    const fromBottom = rows - row;
    return heights
      .map((height) => {
        if (fromBottom <= height) return "S";
        return fromBottom === height + 1 ? "E" : ".";
      })
      .join("");
  });
}

// Wide enough for the widest Ask box; narrower boxes clip it.
const BOX_SNOW_HEIGHTS = Array.from(
  { length: 128 },
  (_, index) => 2 + (pseudoRandom(index, 7) > 0.72 ? 1 : 0),
);
export const BOX_SNOW: PixelMap = snowMap(BOX_SNOW_HEIGHTS, 4);
/** Height of the lowest snow on the Ask box, edge pixel included. */
export const BOX_SNOW_HEIGHT = 3 * SNOW_BLOCK;
