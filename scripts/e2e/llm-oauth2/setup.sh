#!/usr/bin/env bash
set -euo pipefail

# Generates the test key material for the OAuth2 LLM connection e2e harness
# into the git-ignored generated/ folder and renders the Keycloak realm:
#   generated/pk-jwt.private.jwk.json  RSA private JWK (with kid) for pk-jwt
#   generated/secrets.json             client secrets for cs-basic, cs-post, cs-jwt
#   generated/realm.json               realm import for Keycloak
# Keeps existing material unless --force is passed (Keycloak only imports the
# realm on a fresh container, so regenerate only together with `down`).

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATED="$HERE/generated"

if [[ -f "$GENERATED/realm.json" && "${1:-}" != "--force" ]]; then
  echo "generated/ already exists, keeping it (pass --force to regenerate)"
  exit 0
fi

mkdir -p "$GENERATED"
chmod 700 "$GENERATED"

node --input-type=module - "$HERE" <<'NODE'
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = process.argv[2];
const generated = join(here, "generated");

const kid = `lf-e2e-${randomBytes(6).toString("hex")}`;
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateJwk = {
  ...privateKey.export({ format: "jwk" }),
  kid,
  alg: "RS256",
  use: "sig",
};
const publicJwk = {
  kty: privateJwk.kty,
  n: privateJwk.n,
  e: privateJwk.e,
  kid,
  alg: "RS256",
  use: "sig",
};
const secrets = {
  "cs-basic": randomBytes(32).toString("hex"),
  "cs-post": randomBytes(32).toString("hex"),
  "cs-jwt": randomBytes(32).toString("hex"),
};

const placeholders = {
  __CS_BASIC_SECRET__: secrets["cs-basic"],
  __CS_POST_SECRET__: secrets["cs-post"],
  __CS_JWT_SECRET__: secrets["cs-jwt"],
  __PK_JWT_JWKS__: JSON.stringify({ keys: [publicJwk] }),
};
const render = (value) => {
  if (typeof value === "string") return placeholders[value] ?? value;
  if (Array.isArray(value)) return value.map(render);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, render(inner)]),
    );
  }
  return value;
};
const realm = render(
  JSON.parse(readFileSync(join(here, "keycloak/realm.template.json"), "utf8")),
);

const write = (name, data) =>
  writeFileSync(join(generated, name), `${JSON.stringify(data, null, 2)}\n`, {
    mode: 0o600,
  });
write("pk-jwt.private.jwk.json", privateJwk);
write("secrets.json", secrets);
// Keycloak runs as a non-root user and must be able to read the import.
writeFileSync(join(generated, "realm.json"), `${JSON.stringify(realm, null, 2)}\n`, {
  mode: 0o644,
});

console.log(`generated RSA key (kid ${kid}), client secrets and realm.json in ${generated}`);
NODE
