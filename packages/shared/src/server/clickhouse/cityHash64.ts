/**
 * ClickHouse-compatible CityHash64 (CityHash v1.0.2).
 *
 * ClickHouse froze its `cityHash64` SQL function to the CityHash 1.0.2
 * algorithm; Google's upstream CityHash changed afterwards and is NOT
 * compatible. This is a faithful BigInt port of the 1.0.2 variant used by
 * ClickHouse (mirrors ClickHouse/clickhouse-go `lib/cityhash102`).
 *
 * We need this to compute the Distributed sharding key on the application side
 * so we can write directly to `<table>_local` shards. See shardRouting.ts.
 *
 * Correctness is verified against a live ClickHouse `SELECT cityHash64(...)` in
 * unit tests — do not "optimise" this without re-checking those fixtures.
 */

const MASK64 = (1n << 64n) - 1n;

const k0 = 0xc3a5c85c97cb3127n;
const k1 = 0xb492b66fbe98f273n;
const k2 = 0x9ae16a3b2f90404fn;
const k3 = 0xc949d7c7509e6557n;
const kMul = 0x9ddfea08eb382d69n;

const u64 = (v: bigint): bigint => v & MASK64;
const mul = (a: bigint, b: bigint): bigint => u64(a * b);
const add = (...vals: bigint[]): bigint =>
  u64(vals.reduce((acc, v) => acc + v, 0n));
const sub = (a: bigint, b: bigint): bigint => u64(a - b);

const rotate64 = (val: bigint, shift: bigint): bigint => {
  if (shift === 0n) return val;
  return u64((val >> shift) | (val << (64n - shift)));
};

// v1.0.2 uses an unconditional rotate here (shift is always >= 1 at call site).
const rotate64ByAtLeast1 = (val: bigint, shift: bigint): bigint =>
  u64((val >> shift) | (val << (64n - shift)));

const shiftMix = (val: bigint): bigint => u64(val ^ (val >> 47n));

const fetch64 = (buf: Buffer, offset: number): bigint =>
  buf.readBigUInt64LE(offset);

const fetch32 = (buf: Buffer, offset: number): bigint =>
  BigInt(buf.readUInt32LE(offset));

/**
 * Hash128to64 — combines a 128-bit value (lo, hi) into 64 bits. ClickHouse uses
 * this as the `combineHashes` step for multi-argument `cityHash64(a, b, ...)`.
 */
export const hash128to64 = (lo: bigint, hi: bigint): bigint => {
  let a = mul(lo ^ hi, kMul);
  a = u64(a ^ (a >> 47n));
  let b = mul(hi ^ a, kMul);
  b = u64(b ^ (b >> 47n));
  b = mul(b, kMul);
  return b;
};

const hashLen16 = (u: bigint, v: bigint): bigint => hash128to64(u, v);

const hashLen0to16 = (s: Buffer, length: number): bigint => {
  const len = BigInt(length);
  if (length > 8) {
    const a = fetch64(s, 0);
    const b = fetch64(s, length - 8);
    return u64(hashLen16(a, rotate64ByAtLeast1(add(b, len), len)) ^ b);
  }
  if (length >= 4) {
    const a = fetch32(s, 0);
    return hashLen16(add(len, a << 3n), fetch32(s, length - 4));
  }
  if (length > 0) {
    const a = BigInt(s[0]);
    const b = BigInt(s[length >> 1]);
    const c = BigInt(s[length - 1]);
    const y = u64(a + (b << 8n));
    const z = u64(len + (c << 2n));
    return mul(shiftMix(mul(y, k2) ^ mul(z, k3)), k2);
  }
  return k2;
};

const hashLen17to32 = (s: Buffer, length: number): bigint => {
  const a = mul(fetch64(s, 0), k1);
  const b = fetch64(s, 8);
  const c = mul(fetch64(s, length - 8), k2);
  const d = mul(fetch64(s, length - 16), k0);
  return hashLen16(
    add(rotate64(sub(a, b), 43n), rotate64(c, 30n), d),
    add(a, rotate64(b ^ k3, 20n), sub(0n, c), BigInt(length)),
  );
};

type U128 = { lo: bigint; hi: bigint };

const weakHashLen32WithSeeds = (
  w: bigint,
  x: bigint,
  y: bigint,
  z: bigint,
  aIn: bigint,
  bIn: bigint,
): U128 => {
  let a = add(aIn, w);
  let b = rotate64(add(bIn, a, z), 21n);
  const c = a;
  a = add(a, x);
  a = add(a, y);
  b = add(b, rotate64(a, 44n));
  return { lo: add(a, z), hi: add(b, c) };
};

const weakHashLen32WithSeeds3 = (
  s: Buffer,
  offset: number,
  a: bigint,
  b: bigint,
): U128 =>
  weakHashLen32WithSeeds(
    fetch64(s, offset),
    fetch64(s, offset + 8),
    fetch64(s, offset + 16),
    fetch64(s, offset + 24),
    a,
    b,
  );

const hashLen33to64 = (s: Buffer, length: number): bigint => {
  let z = fetch64(s, 24);
  let a = add(
    fetch64(s, 0),
    mul(add(BigInt(length), fetch64(s, length - 16)), k0),
  );
  let b = rotate64(add(a, z), 52n);
  let c = rotate64(a, 37n);
  a = add(a, fetch64(s, 8));
  c = add(c, rotate64(a, 7n));
  a = add(a, fetch64(s, 16));
  const vf = add(a, z);
  const vs = add(b, rotate64(a, 31n), c);

  a = add(fetch64(s, 16), fetch64(s, length - 32));
  z = fetch64(s, length - 8);
  b = rotate64(add(a, z), 52n);
  c = rotate64(a, 37n);
  a = add(a, fetch64(s, length - 24));
  c = add(c, rotate64(a, 7n));
  a = add(a, fetch64(s, length - 16));
  const wf = add(a, z);
  const ws = add(b, rotate64(a, 31n), c);
  const r = shiftMix(add(mul(add(vf, ws), k2), mul(add(wf, vs), k0)));
  return mul(shiftMix(add(mul(r, k0), vs)), k2);
};

/**
 * ClickHouse cityHash64 of a single byte buffer.
 */
export const cityHash64 = (buf: Buffer): bigint => {
  const length = buf.length;
  if (length <= 32) {
    if (length <= 16) return hashLen0to16(buf, length);
    return hashLen17to32(buf, length);
  }
  if (length <= 64) return hashLen33to64(buf, length);

  let s = buf;
  let len = length;
  let x = fetch64(s, 0);
  let y = u64(fetch64(s, len - 16) ^ k1);
  let z = u64(fetch64(s, len - 56) ^ k0);

  let v = weakHashLen32WithSeeds3(s, len - 64, BigInt(len), y);
  let w = weakHashLen32WithSeeds3(s, len - 32, mul(BigInt(len), k1), k0);

  z = add(z, mul(shiftMix(v.hi), k1));
  x = mul(rotate64(add(z, x), 39n), k1);
  y = mul(rotate64(y, 33n), k1);

  // Decrease len to the nearest multiple of 64, and operate on 64-byte chunks.
  len = (len - 1) & ~63;
  let sOffset = 0;
  do {
    x = mul(rotate64(add(x, y, v.lo, fetch64(s, sOffset + 16)), 37n), k1);
    y = mul(rotate64(add(y, v.hi, fetch64(s, sOffset + 48)), 42n), k1);
    x = u64(x ^ w.hi);
    y = u64(y ^ v.lo);
    z = rotate64(u64(z ^ w.lo), 33n);
    v = weakHashLen32WithSeeds3(s, sOffset, mul(v.hi, k1), add(x, w.lo));
    w = weakHashLen32WithSeeds3(s, sOffset + 32, add(z, w.hi), y);
    const tmp = z;
    z = x;
    x = tmp;
    sOffset += 64;
    len -= 64;
  } while (len !== 0);

  return hashLen16(
    add(hashLen16(v.lo, w.lo), mul(shiftMix(y), k1), z),
    add(hashLen16(v.hi, w.hi), x),
  );
};

/**
 * ClickHouse cityHash64 of one or more String arguments, matching
 * `cityHash64(arg1, arg2, ...)` semantics: the first argument's hash seeds the
 * accumulator and each subsequent argument is folded in via Hash128to64.
 *
 * Strings are hashed as their raw UTF-8 bytes (no null terminator), which is
 * how ClickHouse hashes String column values.
 */
export const cityHash64OfStrings = (...args: string[]): bigint => {
  if (args.length === 0) return k2;
  let acc = cityHash64(Buffer.from(args[0], "utf-8"));
  for (let i = 1; i < args.length; i++) {
    const h = cityHash64(Buffer.from(args[i], "utf-8"));
    acc = hash128to64(acc, h);
  }
  return acc;
};
