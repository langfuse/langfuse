// Domain helpers over the parse-once JSON type. Combinators-only: no raw()
// SQL in this file. `otelId` returns a *branded* hex string — forgetting the
// hex() step (the bug the checksum harness once caught) is now a type error.
import {
  type Expr,
  arrayCumSum,
  arrayElement,
  arrayEnumerate,
  arrayFilter,
  arrayLength,
  arrayMap,
  arrayMap2,
  arrayStringConcat,
  arrLit,
  assumeNotNull_,
  base64Encode,
  bitAnd,
  brandAs,
  castTo,
  charF,
  concat,
  extractAllGroupsVertical,
  fromUnixTimestamp64Nano,
  gt,
  gtN,
  hasF as hasArr,
  hexOf,
  iff,
  ifNull_,
  isNotNull,
  jsonPath,
  jsonTyped,
  lit,
  locals,
  lower,
  minus,
  mul,
  multiIf,
  notF,
  numLit,
  plus,
  replaceAll,
  sha256,
  splitByRegexp,
  startsWithF,
  strLength,
  substringF,
  toInt64,
  toInt64OrZero,
  toStringF,
  toUInt32,
  toUInt64,
  toUInt64OrZero,
  toUInt8,
  tryBase64Decode,
  tupleOf,
} from "./core.ts";

/** nominal type: lowercase-hex-rendered id (Scala-style brand on a stringy type) */
export type HexId = Expr<"String", "hex">;
const asHex = brandAs<"hex">();

/** OTel id field: hex string leaf OR Buffer-object `.data` path -> lowercase hex */
export const otelId = (container: Expr<"JSON">, field: string): HexId =>
  ifNull_<"String", "hex">(
    // trust boundary: OTLP/JSON senders put hex in the string leaf
    asHex(jsonTyped(container, field, "String")),
    lower(
      hexOf(
        arrayStringConcat(
          arrayMap(
            (b) => charF(b),
            castTo(jsonPath(container, field, "data"), "Array(UInt8)"),
          ),
        ),
      ),
    ),
  );

/** protobufjs Long `{low, high}` paths -> UInt64 */
const longPathsToUInt64 = (
  container: Expr<"JSON">,
  path: string,
): Expr<"UInt64"> =>
  plus<"UInt64">(
    mul(
      toUInt64(
        ifNull_(jsonTyped(container, `${path}.high`, "Int64"), numLit(0)),
      ),
      4294967296,
    ),
    toUInt64(
      bitAnd(
        ifNull_(jsonTyped(container, `${path}.low`, "Int64"), numLit(0)),
        4294967295,
      ),
    ),
  );

/** OTel uint64-nanos field: decimal-string leaf OR protobufjs Long paths */
export const otelNanos = (
  container: Expr<"JSON">,
  field: string,
): Expr<"UInt64"> =>
  iff(
    isNotNull(jsonTyped(container, field, "String")),
    toUInt64OrZero(assumeNotNull_(jsonTyped(container, field, "String"))),
    longPathsToUInt64(container, field),
  );

export const nanosToDateTime64 = (ns: Expr<"UInt64">) =>
  fromUnixTimestamp64Nano(toInt64(ns));

// --- OTLP KeyValue[] lanes over Array(JSON) ---
export const kvKeys = (attrs: Expr<"Array(JSON)">): Expr<"Array(String)"> =>
  arrayMap((kv) => ifNull_(jsonTyped(kv, "key", "String"), lit("")), attrs);
export const kvStringValues = (
  attrs: Expr<"Array(JSON)">,
): Expr<"Array(String)"> =>
  arrayMap(
    (kv) => ifNull_(jsonTyped(kv, "value.stringValue", "String"), lit("")),
    attrs,
  );
/** int values: decimal string (OTLP/JSON) or Long paths (protobuf) or plain number */
export const kvIntValues = (attrs: Expr<"Array(JSON)">): Expr<"Array(Int64)"> =>
  arrayMap(
    (kv) =>
      multiIf<"Int64">(
        [
          [
            isNotNull(jsonTyped(kv, "value.intValue", "String")),
            toInt64OrZero(
              assumeNotNull_(jsonTyped(kv, "value.intValue", "String")),
            ),
          ],
          [
            isNotNull(jsonTyped(kv, "value.intValue.low", "Int64")),
            plus<"Int64">(
              mul(
                ifNull_(
                  jsonTyped(kv, "value.intValue.high", "Int64"),
                  numLit(0),
                ),
                4294967296,
              ),
              bitAnd(
                assumeNotNull_(jsonTyped(kv, "value.intValue.low", "Int64")),
                4294967295,
              ),
            ),
          ],
        ],
        ifNull_(jsonTyped(kv, "value.intValue", "Int64"), numLit(0)),
      ),
    attrs,
  );
export const kvDoubleValues = (
  attrs: Expr<"Array(JSON)">,
): Expr<"Array(Float64)"> =>
  arrayMap(
    (kv) =>
      ifNull_(
        jsonTyped(kv, "value.doubleValue", "Float64"),
        numLit<"Float64">(0),
      ),
    attrs,
  );

const META_PREFIX = "langfuse.observation.metadata.";

/** unmapped attributes -> metadata_names/metadata_values (events_full shape) */
export const metadataArrays = (
  cols: {
    keys: Expr<"Array(String)">;
    vals: Expr<"Array(String)">;
    ivals: Expr<"Array(Int64)">;
    dvals: Expr<"Array(Float64)">;
  },
  liftedKeys: string[],
) => {
  const idx = locals({
    meta_idx: arrayFilter(
      (i) =>
        notF(hasArr(arrLit<"String">(liftedKeys), arrayElement(cols.keys, i))),
      arrayEnumerate(cols.keys),
    ),
  });
  const metadata_names = arrayMap(
    (i) =>
      iff(
        startsWithF(arrayElement(cols.keys, i), META_PREFIX),
        substringF(arrayElement(cols.keys, i), META_PREFIX.length + 1),
        arrayElement(cols.keys, i),
      ),
    idx.ref.meta_idx,
  );
  const metadata_values = arrayMap(
    (i) =>
      multiIf<"String">(
        [
          [arrayElement(cols.vals, i).neq(""), arrayElement(cols.vals, i)],
          [
            arrayElement(cols.ivals, i).neq(0),
            toStringF(arrayElement(cols.ivals, i)),
          ],
          [
            arrayElement(cols.dvals, i).neq(0),
            toStringF(arrayElement(cols.dvals, i)),
          ],
        ],
        lit(""),
      ),
    idx.ref.meta_idx,
  );
  return { ...idx.defs, metadata_names, metadata_values };
};

// --- media extraction (data URIs) ---
const CT = "[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+";
export const MEDIA_DETECT_RE = `data:${CT};base64,`;
const MEDIA_FULL_RE = `data:${CT};base64,[A-Za-z0-9+/=]+`;
const MEDIA_GROUPS_RE = `data:(${CT});base64,([A-Za-z0-9+/=]+)`;

/** urlsafe-b64(SHA-256(decoded)) — mediaService.getMediaId semantics */
const mediaId = (b64: Expr<"String">) =>
  replaceAll(
    replaceAll(base64Encode(sha256(tryBase64Decode(b64))), "+", "-"),
    "/",
    "_",
  );

/** single-element Array(String) literal from an expression */
const arrLitOf = (e: Expr<"String">): Expr<"Array(String)"> =>
  arrLit<"String">([e]);

/** stage-level intermediates; feed to mediaProjection in the next stage.
 *  Sibling aliases are typed refs via locals() — no stringly raw() refs. */
export const mediaIntermediates = (
  inputRaw: Expr<"String">,
  isCandidate: Expr<"UInt8">,
) => {
  const base = locals({
    media_matches: iff(
      isCandidate,
      extractAllGroupsVertical(inputRaw, MEDIA_GROUPS_RE),
      arrLit<"Array(String)">([]),
    ),
    frags: iff(
      isCandidate,
      splitByRegexp(MEDIA_FULL_RE, inputRaw),
      arrLitOf(inputRaw),
    ),
  });
  const ids = locals({
    media_ids: arrayMap(
      (g) => mediaId(arrayElement(g, 2)),
      base.ref.media_matches,
    ),
  });
  const toks = locals({
    tokens: arrayMap2(
      (g, id) =>
        concat(
          "@@@langfuseMedia:type=",
          arrayElement(g, 1),
          "|id=",
          id,
          "|source=base64_data_uri@@@",
        ),
      base.ref.media_matches,
      ids.ref.media_ids,
    ),
    // 'data:'(5) + ct + ';base64,'(8) + b64
    match_lens: arrayMap(
      (g) =>
        toUInt32(
          plus(
            13,
            strLength(arrayElement(g, 1)),
            strLength(arrayElement(g, 2)),
          ),
        ),
      base.ref.media_matches,
    ),
  });
  const cums = locals({
    cum_frag_lens: arrayCumSum(arrayMap((f) => strLength(f), base.ref.frags)),
    cum_match_lens: arrayCumSum(toks.ref.match_lens),
  });
  const offsets = arrayMap(
    (i) =>
      toUInt32(
        plus(
          arrayElement(cums.ref.cum_frag_lens, i),
          iff(
            gtN(i, 1),
            arrayElement(cums.ref.cum_match_lens, minus(i, 1)),
            numLit<"UInt64">(0),
          ),
        ),
      ),
    arrayEnumerate(base.ref.media_matches),
  );
  return { ...base.defs, ...ids.defs, ...toks.defs, ...cums.defs, offsets };
};

type MediaCols = {
  media_matches: Expr<"Array(Array(String))">;
  frags: Expr<"Array(String)">;
  media_ids: Expr<"Array(String)">;
  tokens: Expr<"Array(String)">;
  match_lens: Expr<"Array(UInt32)">;
  offsets: Expr<"Array(UInt32)">;
};

/** final projection: rewritten payload + flag + uploader manifest */
export const mediaProjection = (s: MediaCols) => ({
  input: arrayStringConcat(
    arrayMap(
      (i) =>
        concat(
          arrayElement(s.frags, i),
          iff(i.lte(arrayLength(s.tokens)), arrayElement(s.tokens, i), lit("")),
        ),
      arrayEnumerate(s.frags),
    ),
  ),
  has_media: toUInt8(gt(arrayLength(s.media_matches), 0)),
  media_manifest: arrayMap(
    (i) =>
      tupleOf(
        arrayElement(s.media_ids, i),
        arrayElement(arrayElement(s.media_matches, i), 1),
        lit("input"),
        arrayElement(s.offsets, i),
        arrayElement(s.match_lens, i),
      ),
    arrayEnumerate(s.media_matches),
  ),
});
