import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

/**
 * The self-hosted IBM Plex Mono faces back every `font-mono` surface. A face
 * that is missing a character does not fail loudly: the browser substitutes a
 * system monospace for that character alone, so one line of text renders in
 * two typefaces. These tests read the shipped binaries and assert the coverage
 * contract in `web/public/fonts/README.md`.
 */

const FONT_DIR = join(import.meta.dirname, "../../public/fonts");

/** Every character IBM Plex Mono 2.3 defines a glyph for. */
const UPSTREAM_CODEPOINT_COUNT = 930;

const SAMPLES = {
  "Latin-1": "àäçèéêîôùûÀÄÇÈÉÊÎÔÙÛ",
  "Latin Extended-A (Polish)": "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ",
  "Latin Extended-A (Turkish)": "ğışİŞĞ",
  Vietnamese: "ăâđêôơưẠảấầẫậắằẵặ",
  Cyrillic: "абвгдеёжзийклмнопрстуфхцчшщъыьэюяАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩ",
  "Cyrillic (Ukrainian)": "іїєґІЇЄҐ",
  "Box drawing": "─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬",
  Arrows: "←→↑↓↔↕",
  Mathematical: "±×÷≈≠≤≥∑∏√∞∫",
} as const;

const WOFF2_SIGNATURE = 0x774f4632;
const WOFF2_HEADER_BYTES = 48;
/** Table directory flag meaning "a four-byte tag follows" instead of a known-table index. */
const CUSTOM_TAG_INDEX = 0x3f;
/** The known-table indices this reader needs to recognise by name. */
const KNOWN_TAGS = new Map([
  [0, "cmap"],
  [10, "glyf"],
  [11, "loca"],
]);

const UINT16_VALUES = 0x10000;

/** Glyph ids are computed modulo 2^16, and the arithmetic can go negative. */
function wrapGlyphId(value: number): number {
  return ((value % UINT16_VALUES) + UINT16_VALUES) % UINT16_VALUES;
}

type Cursor = { offset: number };

/** Variable-length integer: seven bits per byte, high bit set to continue. */
function readUIntBase128(view: DataView, cursor: Cursor): number {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = view.getUint8(cursor.offset++);
    value = value * 128 + (byte % 128);
    if (byte < 128) return value;
  }
  throw new Error("malformed UIntBase128");
}

/**
 * Extract the `cmap` table from a woff2 file. The table directory gives each
 * table's length in the Brotli-compressed block, which holds the tables
 * concatenated in directory order.
 */
function readCmapTable(file: Buffer): Buffer {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0) !== WOFF2_SIGNATURE)
    throw new Error("not a woff2 file");

  const numTables = view.getUint16(12);
  const cursor: Cursor = { offset: WOFF2_HEADER_BYTES };
  let cmap: { offset: number; length: number } | undefined;
  let blockOffset = 0;

  for (let i = 0; i < numTables; i++) {
    const flags = view.getUint8(cursor.offset++);
    const knownTagIndex = flags % 64;
    const transformVersion = Math.floor(flags / 64);

    let tag: string | undefined;
    if (knownTagIndex === CUSTOM_TAG_INDEX) {
      tag = file.toString("latin1", cursor.offset, cursor.offset + 4);
      cursor.offset += 4;
    } else {
      tag = KNOWN_TAGS.get(knownTagIndex);
    }

    // `glyf` and `loca` are transformed unless the version says otherwise;
    // every other table is the other way round. A transformed table carries a
    // second length, which is the one it occupies in the compressed block.
    const originalLength = readUIntBase128(view, cursor);
    const transformed =
      tag === "glyf" || tag === "loca"
        ? transformVersion !== 3
        : transformVersion !== 0;
    const storedLength = transformed
      ? readUIntBase128(view, cursor)
      : originalLength;

    if (tag === "cmap") cmap = { offset: blockOffset, length: storedLength };
    blockOffset += storedLength;
  }

  if (!cmap) throw new Error("woff2 file has no cmap table");
  const tables = brotliDecompressSync(file.subarray(cursor.offset));
  return tables.subarray(cmap.offset, cmap.offset + cmap.length);
}

/** cmap subtable format 4: segmented coverage of the Basic Multilingual Plane. */
function readFormat4(view: DataView, base: number, into: Set<number>): void {
  const segmentCount = view.getUint16(base + 6) / 2;
  const endCodeAt = base + 14;
  const startCodeAt = endCodeAt + segmentCount * 2 + 2;
  const idDeltaAt = startCodeAt + segmentCount * 2;
  const idRangeOffsetAt = idDeltaAt + segmentCount * 2;

  for (let segment = 0; segment < segmentCount; segment++) {
    const start = view.getUint16(startCodeAt + segment * 2);
    if (start === 0xffff) continue;
    const end = view.getUint16(endCodeAt + segment * 2);
    const delta = view.getInt16(idDeltaAt + segment * 2);
    const rangeOffset = view.getUint16(idRangeOffsetAt + segment * 2);

    for (
      let codepoint = start;
      codepoint <= end && codepoint !== 0xffff;
      codepoint++
    ) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = wrapGlyphId(codepoint + delta);
      } else {
        const at =
          idRangeOffsetAt + segment * 2 + rangeOffset + (codepoint - start) * 2;
        glyph = view.getUint16(at);
        if (glyph !== 0) glyph = wrapGlyphId(glyph + delta);
      }
      // A segment is allowed to map a character to the "missing glyph".
      if (glyph !== 0) into.add(codepoint);
    }
  }
}

/** cmap subtable format 12: grouped coverage, used beyond the BMP. */
function readFormat12(view: DataView, base: number, into: Set<number>): void {
  const groupCount = view.getUint32(base + 12);
  for (let group = 0; group < groupCount; group++) {
    const at = base + 16 + group * 12;
    const start = view.getUint32(at);
    const end = view.getUint32(at + 4);
    const startGlyph = view.getUint32(at + 8);
    for (let codepoint = start; codepoint <= end; codepoint++) {
      // Glyph ids run consecutively from startGlyph, so at most the first
      // character of a group lands on the "missing glyph".
      if (startGlyph + (codepoint - start) !== 0) into.add(codepoint);
    }
  }
}

function readCodepoints(fileName: string): Set<number> {
  const cmap = readCmapTable(readFileSync(join(FONT_DIR, fileName)));
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const codepoints = new Set<number>();

  const subtableCount = view.getUint16(2);
  for (let i = 0; i < subtableCount; i++) {
    const base = view.getUint32(4 + i * 8 + 4);
    const format = view.getUint16(base);
    if (format === 4) readFormat4(view, base, codepoints);
    else if (format === 12) readFormat12(view, base, codepoints);
  }
  return codepoints;
}

// Discovered rather than listed, so a face added later is held to the same
// contract instead of slipping in under a suite that stays green.
const faces = readdirSync(FONT_DIR)
  .filter((fileName) => fileName.endsWith(".woff2"))
  .sort()
  .map((fileName) => [fileName, readCodepoints(fileName)] as const);

it("finds the faces fonts.ts loads", () => {
  expect(faces.map(([fileName]) => fileName)).toEqual([
    "IBMPlexMono-Bold.woff2",
    "IBMPlexMono-Regular.woff2",
  ]);
});

describe.each(faces)("%s", (_fileName, codepoints) => {
  it("ships every glyph of the upstream family", () => {
    expect(codepoints.size).toBe(UPSTREAM_CODEPOINT_COUNT);
  });

  it.each(Object.entries(SAMPLES))("covers %s", (_script, sample) => {
    const missing = [...sample].filter(
      (character) => !codepoints.has(character.codePointAt(0)!),
    );
    expect(missing).toEqual([]);
  });
});

it("declares the same characters in every weight", () => {
  // A character present in one weight only renders in a fallback font as soon
  // as it is bold, which is the same mixed-typeface bug one weight deep.
  const [[, reference]] = faces;
  const disagreements = faces.flatMap(([fileName, codepoints]) =>
    [
      ...[...reference].filter((cp) => !codepoints.has(cp)),
      ...[...codepoints].filter((cp) => !reference.has(cp)),
    ].map((cp) => `${fileName} U+${cp.toString(16).toUpperCase()}`),
  );
  expect(disagreements).toEqual([]);
});
