// Tiny typed SQL-pipeline compiler: stages are typed relation->relation
// functions in TS; compile() fuses them into one WITH-chained INSERT SELECT.
// Types are ClickHouse type names carried as string literals, so column
// references and helper signatures typecheck end to end.

/** JS literals auto-lift: strings quote, numbers print */
export type RHS = Expr<string> | string | number;
const liftSql = (v: RHS): string =>
  typeof v === "string"
    ? `'${v.replaceAll("'", "\\'")}'`
    : typeof v === "number"
      ? String(v)
      : v.sql;

export type Expr<T extends string = string, B = unknown> = {
  readonly sql: string;
  /** phantom: ClickHouse type of this expression */
  readonly __t?: T;
  /** phantom: nominal brand (semantic refinement of stringy types) */
  readonly __b?: B;
  // fluent comparisons/arithmetic (literals auto-lift)
  eq(b: RHS): Expr<"UInt8">;
  neq(b: RHS): Expr<"UInt8">;
  gt(b: RHS): Expr<"UInt8">;
  gte(b: RHS): Expr<"UInt8">;
  lt(b: RHS): Expr<"UInt8">;
  lte(b: RHS): Expr<"UInt8">;
  plus(b: RHS): Expr<T, B>;
  isEmpty(): Expr<"UInt8">;
};

/** bless an expression with a nominal brand at a trust boundary (curried so T infers) */
export const brandAs =
  <B>() =>
  <T extends string>(e: Expr<T>): Expr<T, B> =>
    e as Expr<T, B>;

export type Shape = Record<string, string>;
export type Cols<S extends Shape> = { [K in keyof S]: Expr<S[K]> };
type ShapeOf<R extends Record<string, Expr<string>>> = {
  [K in keyof R]: R[K] extends Expr<infer T> ? T : never;
};
export type ElemOf<A extends string> = A extends `Array(${infer T})`
  ? T
  : never;

export const raw = <T extends string>(sql: string): Expr<T> => {
  const cmp = (op: string) => (b: RHS) =>
    raw<"UInt8">(`(${sql} ${op} ${liftSql(b)})`);
  return {
    sql,
    eq: cmp("="),
    neq: cmp("!="),
    gt: cmp(">"),
    gte: cmp(">="),
    lt: cmp("<"),
    lte: cmp("<="),
    plus: (b: RHS) => raw(`(${sql} + ${liftSql(b)})`),
    isEmpty: () => raw<"UInt8">(`(${sql} = '')`),
  } as Expr<T>;
};

/** Spark/polars-style conditional: when(cond).then(a).otherwise(b) */
export const when = (cond: Expr<"UInt8">) => ({
  then: <T extends string, B>(t: Expr<T, B> | string | number) => ({
    otherwise: (f: Expr<T, B> | string | number): Expr<T, B> =>
      raw(
        `if(${cond.sql}, ${liftSql(t as RHS)}, ${liftSql(f as RHS)})`,
      ) as Expr<T, B>,
  }),
});
export const lit = (v: string | number): Expr<"String"> =>
  typeof v === "number" ? raw(String(v)) : raw(`'${v.replaceAll("'", "\\'")}'`);

// --- generic ClickHouse function helpers (only what the pipeline needs) ---
const call = <T extends string>(fn: string, ...args: Expr<string>[]): Expr<T> =>
  raw(`${fn}(${args.map((a) => a.sql).join(", ")})`);

export const arrayMap = <A extends string, U extends string>(
  f: (x: Expr<ElemOf<A>>) => Expr<U>,
  arr: Expr<A>,
): Expr<`Array(${U})`> => raw(`arrayMap(x -> ${f(raw("x")).sql}, ${arr.sql})`);
export const arrayMap2 = <A extends string, B extends string, U extends string>(
  f: (a: Expr<ElemOf<A>>, b: Expr<ElemOf<B>>) => Expr<U>,
  as: Expr<A>,
  bs: Expr<B>,
): Expr<`Array(${U})`> =>
  raw(`arrayMap((x, y) -> ${f(raw("x"), raw("y")).sql}, ${as.sql}, ${bs.sql})`);
export const arrayJoin = <A extends string>(a: Expr<A>): Expr<ElemOf<A>> =>
  call("arrayJoin", a);
export const arrayElement = <A extends string>(
  a: Expr<A>,
  i: Expr<string> | number,
): Expr<ElemOf<A>> => raw(`${a.sql}[${typeof i === "number" ? i : i.sql}]`);
export const arrayEnumerate = (a: Expr<string>) =>
  raw<"Array(UInt32)">(`arrayEnumerate(${a.sql})`);
export const arrayCumSum = (a: Expr<string>) =>
  raw<"Array(UInt64)">(`arrayCumSum(${a.sql})`);
export const arrayStringConcat = (a: Expr<"Array(String)">) =>
  call<"String">("arrayStringConcat", a);
export const arrayLength = (a: Expr<string>) => call<"UInt64">("length", a);

export const splitByRegexp = (re: string, s: Expr<"String">) =>
  raw<"Array(String)">(`splitByRegexp('${re}', ${s.sql})`);
export const extractAllGroupsVertical = (s: Expr<"String">, re: string) =>
  raw<"Array(Array(String))">(`extractAllGroupsVertical(${s.sql}, '${re}')`);
export const extractRe = (s: Expr<"String">, re: string) =>
  raw<"String">(`extract(${s.sql}, '${re}')`);
export const match = (s: Expr<"String">, re: string) =>
  raw<"UInt8">(`match(${s.sql}, '${re}')`);

export const iff = <T extends string>(
  c: Expr<string>,
  t: Expr<T>,
  f: Expr<T>,
): Expr<T> => raw(`if(${c.sql}, ${t.sql}, ${f.sql})`);
export const multiIf = <T extends string>(
  cases: Array<[Expr<string>, Expr<T>]>,
  otherwise: Expr<T>,
): Expr<T> =>
  raw(
    `multiIf(${cases.map(([c, v]) => `${c.sql}, ${v.sql}`).join(", ")}, ${otherwise.sql})`,
  );
export const gt = (a: Expr<string>, b: Expr<string> | number) =>
  raw<"UInt8">(`${a.sql} > ${typeof b === "number" ? b : b.sql}`);
export const concat = (
  ...parts: Array<Expr<string> | string>
): Expr<"String"> =>
  raw(
    `concat(${parts.map((p) => (typeof p === "string" ? `'${p}'` : p.sql)).join(", ")})`,
  );
export const lower = <B>(s: Expr<"String", B>): Expr<"String", B> =>
  raw(`lower(${s.sql})`) as Expr<"String", B>;
export const hexOf = (b: Expr<string>): Expr<"String", "hex"> =>
  raw(`hex(${b.sql})`) as Expr<"String", "hex">;
export const replaceAll = (s: Expr<"String">, from: string, to: string) =>
  raw<"String">(`replaceAll(${s.sql}, '${from}', '${to}')`);
export const strLength = (s: Expr<"String">) => call<"UInt64">("length", s);

export const toUInt8 = (e: Expr<string>) => call<"UInt8">("toUInt8", e);
export const toUInt32 = (e: Expr<string>) => call<"UInt32">("toUInt32", e);
export const toUInt64 = (e: Expr<string>) => call<"UInt64">("toUInt64", e);
export const toInt64 = (e: Expr<string>) => call<"Int64">("toInt64", e);
export const toUInt64OrZero = (e: Expr<string>) =>
  call<"UInt64">("toUInt64OrZero", e);
export const bitAnd = <T extends string>(a: Expr<T>, mask: number): Expr<T> =>
  raw(`bitAnd(${a.sql}, ${mask})`);
export const fromUnixTimestamp64Nano = (e: Expr<"Int64">) =>
  call<"DateTime64(6)">("fromUnixTimestamp64Nano", e);

export const sha256 = (e: Expr<"String">) =>
  call<"FixedString(32)">("SHA256", e);
export const tryBase64Decode = (e: Expr<"String">) =>
  call<"String">("tryBase64Decode", e);
export const base64Encode = (e: Expr<string>) =>
  call<"String">("base64Encode", e);

export const tupleOf = (...es: Expr<string>[]) =>
  raw<"Tuple">(`(${es.map((e) => e.sql).join(", ")})`);

/** typed pass-through of upstream columns */
export const pick = <S extends Shape, K extends keyof S & string>(
  s: Cols<S>,
  ...keys: K[]
): { [P in K]: Expr<S[P]> } =>
  Object.fromEntries(keys.map((k) => [k, s[k]])) as { [P in K]: Expr<S[P]> };

// --- the pipeline itself ---
type StagePart = { name: string; body: string };

export class Pipeline<S extends Shape> {
  private readonly parts: StagePart[];
  private readonly lastName: string;
  private readonly cols: string[];

  private constructor(parts: StagePart[], lastName: string, cols: string[]) {
    this.parts = parts;
    this.lastName = lastName;
    this.cols = cols;
  }

  /** first stage: columns projected off a raw FROM clause (e.g. s3(...)) */
  static source<R extends Record<string, Expr<string>>>(
    name: string,
    fromClause: string,
    build: R,
  ): Pipeline<ShapeOf<R>> {
    const cols = Object.keys(build);
    const body = `SELECT\n${cols.map((c) => `    ${build[c]!.sql} AS ${c}`).join(",\n")}\nFROM ${fromClause}`;
    return new Pipeline([{ name, body }], name, cols);
  }

  /** linear stage: reads the previous stage, full type flow */
  stage<R extends Record<string, Expr<string>>>(
    name: string,
    build: (s: Cols<S>) => R,
  ): Pipeline<ShapeOf<R>> {
    const handle = Object.fromEntries(
      this.cols.map((c) => [c, raw(c)]),
    ) as Cols<S>;
    const record = build(handle);
    const cols = Object.keys(record);
    const body = `SELECT\n${cols.map((c) => `    ${record[c]!.sql} AS ${c}`).join(",\n")}\nFROM ${this.lastName}`;
    return new Pipeline(
      [...this.parts, { name, body }],
      name,
      cols,
    ) as Pipeline<ShapeOf<R>>;
  }

  /** fuse into one INSERT ... WITH ... SELECT */
  compile(opts: {
    insertInto: string;
    settings?: Record<string, string>;
  }): string {
    const withClause = this.parts
      .map(
        (p) =>
          `    ${p.name} AS (\n${p.body.replace(/^/gm, "        ")}\n    )`,
      )
      .join(",\n");
    const settings = opts.settings
      ? `\nSETTINGS ${Object.entries(opts.settings)
          .map(([k, v]) => `${k} = '${v}'`)
          .join(", ")}`
      : "";
    return (
      `INSERT INTO ${opts.insertInto}\n    (${this.cols.join(", ")})\n` +
      `WITH\n${withClause}\n` +
      `SELECT ${this.cols.join(", ")}\nFROM ${this.lastName}${settings}\n`
    );
  }
}

// --- JSON-type (parse-once) helpers, added for the events_full-aligned v2 ---
// Path access compiles to `expr.seg1.seg2`; valid only on identifier-ish
// expressions (stage columns, lambda args) — a real limitation of the sugar.
export const jsonPath = (e: Expr<"JSON">, ...segs: string[]): Expr<"JSON"> =>
  raw(`${e.sql}.${segs.join(".")}`);
/**
 * Typed leaf read -> Nullable(Type).
 * String reads stay strict (`.:String`) because they double as encoding
 * discriminators ("is this the hex-string / decimal-string variant?") —
 * coercing a Long object or a number into a string would break those
 * branches. Numeric reads compile to accurateCastOrNull(...) instead: the
 * strict `.:Int64` / `.:Float64` accessor returns NULL or a value depending
 * on how the server typed the surrounding array (behavior changed between
 * ClickHouse 25.12 and 26.2), while the cast depends only on the value.
 */
export const jsonTyped = <T extends string>(
  e: Expr<"JSON">,
  path: string,
  t: T,
): Expr<`Nullable(${T})`> => {
  const p = `${e.sql}${path ? "." + path : ""}`;
  return t === "String"
    ? raw(`${p}.:${t}`)
    : raw(`accurateCastOrNull(${p}, '${t}')`);
};
/** array-of-objects subcolumn `expr.path[]` -> Array(JSON) */
export const jsonArr = (e: Expr<"JSON">, path: string): Expr<"Array(JSON)"> =>
  raw(`${e.sql}${path ? "." + path : ""}[]`);

export const ifNull_ = <T extends string, B = unknown>(
  e: Expr<`Nullable(${T})`, B>,
  fallback: Expr<T, B>,
): Expr<T, B> => raw(`ifNull(${e.sql}, ${fallback.sql})`) as Expr<T, B>;
export const assumeNotNull_ = <T extends string>(
  e: Expr<`Nullable(${T})`>,
): Expr<T> => raw(`assumeNotNull(${e.sql})`);
export const isNotNull = (e: Expr<string>): Expr<"UInt8"> =>
  raw(`${e.sql} IS NOT NULL`);
export const nullIf_ = <T extends string>(
  e: Expr<T>,
  v: Expr<string> | number,
): Expr<`Nullable(${T})`> =>
  raw(`nullIf(${e.sql}, ${typeof v === "number" ? v : v.sql})`);
export const castTo = <T extends string>(e: Expr<string>, t: T): Expr<T> =>
  raw(`CAST(${e.sql}, '${t}')`);

export const arrayFilter = <A extends string>(
  f: (x: Expr<ElemOf<A>>) => Expr<string>,
  arr: Expr<A>,
): Expr<A> => raw(`arrayFilter(x -> ${f(raw("x")).sql}, ${arr.sql})`);
export const indexOfF = (
  arr: Expr<"Array(String)">,
  needle: Expr<string> | string,
): Expr<"UInt64"> =>
  raw(
    `indexOf(${arr.sql}, ${typeof needle === "string" ? `'${needle}'` : needle.sql})`,
  );
export const hasF = (arr: Expr<string>, x: Expr<string>): Expr<"UInt8"> =>
  raw(`has(${arr.sql}, ${x.sql})`);
export const startsWithF = (s: Expr<"String">, prefix: string): Expr<"UInt8"> =>
  raw(`startsWith(${s.sql}, '${prefix}')`);
export const substringF = (
  s: Expr<"String">,
  from: Expr<string> | number,
): Expr<"String"> =>
  raw(`substring(${s.sql}, ${typeof from === "number" ? from : from.sql})`);
export const toStringF = (e: Expr<string>): Expr<"String"> =>
  raw(`toString(${e.sql})`);
export const now64 = (p: number): Expr<"DateTime64(6)"> => raw(`now64(${p})`);
export const toInt64OrZero = (e: Expr<string>): Expr<"Int64"> =>
  raw(`toInt64OrZero(${e.sql})`);

// --- combinator completion pass: kill the raw() escape hatches ---
/** typed reference to an existing column / SQL identifier */
export const col = <T extends string, B = unknown>(name: string): Expr<T, B> =>
  raw(name) as Expr<T, B>;
/** typed references to sibling aliases defined in the same stage record */
export const locals = <R extends Record<string, Expr<string>>>(
  defs: R,
): {
  defs: R;
  ref: { [K in keyof R]: R[K] extends Expr<infer T> ? Expr<T> : never };
} => ({
  defs,
  ref: Object.fromEntries(Object.keys(defs).map((k) => [k, raw(k)])) as {
    [K in keyof R]: R[K] extends Expr<infer T> ? Expr<T> : never;
  },
});

const bin =
  (op: string) =>
  (a: Expr<string>, b: Expr<string> | number): Expr<string> =>
    raw(`(${a.sql} ${op} ${typeof b === "number" ? b : b.sql})`);
export const plus = <T extends string>(
  ...es: Array<Expr<string> | number>
): Expr<T> =>
  raw(
    `(${es.map((e) => (typeof e === "number" ? String(e) : e.sql)).join(" + ")})`,
  );
export const mul = <T extends string>(a: Expr<string>, b: number): Expr<T> =>
  raw(`(${a.sql} * ${b})`);
export const minus = <T extends string>(a: Expr<string>, b: number): Expr<T> =>
  raw(`(${a.sql} - ${b})`);
export const neq = (
  a: Expr<string>,
  b: Expr<string> | number | string,
): Expr<"UInt8"> =>
  raw(
    `(${a.sql} != ${typeof b === "number" ? b : typeof b === "string" ? `'${b}'` : b.sql})`,
  );
export const notF = (e: Expr<"UInt8">): Expr<"UInt8"> => raw(`NOT (${e.sql})`);
export const gtN = bin(">") as (a: Expr<string>, b: number) => Expr<"UInt8">;

export const charF = (e: Expr<string>): Expr<"String"> => raw(`char(${e.sql})`);
export const arraySum = (a: Expr<string>): Expr<"UInt64"> =>
  raw(`arraySum(${a.sql})`);
export const arrLit = <T extends string>(
  vals: Array<string | Expr<string>>,
  _t?: T,
): Expr<`Array(${T})`> =>
  raw(
    `[${vals.map((v) => (typeof v === "string" ? `'${v}'` : v.sql)).join(", ")}]`,
  );
/** CAST((keys, vals), 'Map(...)') with the target map type carried in the type */
export const toMap = <M extends `Map(${string})`>(
  keys: Expr<"Array(String)"> | Expr<`Array(${string})`>,
  vals: Expr<`Array(${string})`>,
  m: M,
): Expr<M> => raw(`CAST((${keys.sql}, ${vals.sql}), '${m}')`);
export const mapFilterF = <M extends string>(
  f: (k: Expr<string>, v: Expr<string>) => Expr<"UInt8">,
  m: Expr<M>,
): Expr<M> =>
  raw(`mapFilter((k, v) -> ${f(raw("k"), raw("v")).sql}, ${m.sql})`);
export const greatestF = <T extends string>(a: Expr<T>, b: number): Expr<T> =>
  raw(`greatest(${a.sql}, ${b})`);
export const numLit = <T extends string = "Int64">(n: number): Expr<T> =>
  raw(String(n)) as Expr<T>;
