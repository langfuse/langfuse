#!/usr/bin/env bash
# Builds Node.js from the pinned upstream source release on UBI 9, linked
# against RHEL's system OpenSSL (libcrypto.so.3), so node:crypto runs on RHEL's
# CMVP-validated OpenSSL FIPS provider whenever RHEL's OpenSSL is in FIPS mode.
#
# The OpenSSL configure flags and 0001-fips-disable-options.patch are taken
# from Red Hat's nodejs:24 module build (nodejs.spec in the RHEL 9 source RPM),
# so Node behaves in FIPS mode as the RPM does: FIPS follows the system OpenSSL
# configuration, and the --enable-fips/--force-fips flags and crypto.setFips()
# cannot change it. Unlike the RPM, Node keeps its bundled dependencies (Brotli,
# c-ares, nghttp2, ...) and full ICU, so an upstream security release ships as
# soon as its source tarball does.
#
# Bump: set NODE_VERSION and NODE_SOURCE_SHA256 from
# https://nodejs.org/dist/v<version>/SHASUMS256.txt (signed by the Node.js
# release keys) and keep .nvmrc in sync. The build fails if the patch no longer
# applies cleanly.
set -euo pipefail

readonly NODE_VERSION=24.22.1
readonly NODE_SOURCE_SHA256=4f5379796280cdaeb0c2f358fd04b6a16cc4fb7dfa83b5a8c91a9d963b435231
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly BUILD_JOBS="${NODE_BUILD_JOBS:-$(nproc)}"

if [[ ! "$BUILD_JOBS" =~ ^[1-9][0-9]*$ ]]; then
  echo "NODE_BUILD_JOBS must be a positive integer" >&2
  exit 1
fi

# UBI 9's default GCC is too old for Node 24; Red Hat builds it with the same
# toolset. Its compiler packages stay in this build stage.
set +u
source /opt/rh/gcc-toolset-12/enable
set -u
export CFLAGS="-O3 -fPIE -fstack-protector-strong -fstack-clash-protection -D_FORTIFY_SOURCE=2 -D_GLIBCXX_ASSERTIONS -DOPENSSL_NO_ENGINE -D_LARGEFILE_SOURCE -D_FILE_OFFSET_BITS=64 -fno-ipa-icf"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-pie -Wl,-z,relro,-z,now"

mkdir -p /build/node
cd /build/node
curl --fail --show-error --silent --location --retry 5 --retry-all-errors \
  --output node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.tar.xz"
printf '%s  node.tar.xz\n' "$NODE_SOURCE_SHA256" | sha256sum --check --strict -
tar -xJf node.tar.xz --strip-components=1

patch --batch --forward --fuzz=0 -p1 < "$SCRIPT_DIR/0001-fips-disable-options.patch"

./configure --prefix=/usr --with-intl=full-icu --without-corepack \
  --shared-openssl --openssl-is-fips --openssl-conf-name=openssl_conf \
  --openssl-use-def-ca-store --use-prefix-to-find-headers
make -j"$BUILD_JOBS"
make DESTDIR=/opt/node install

# A standalone executable needs PIE to randomize its Node/V8 code addresses.
# RELRO/NOW and a non-executable stack are checked on the installed artifact.
python3 - <<'PY'
import subprocess

binary = "/opt/node/usr/bin/node"
header = subprocess.check_output(["readelf", "-hW", binary], text=True)
dynamic = subprocess.check_output(["readelf", "-dW", binary], text=True)
segments = subprocess.check_output(["readelf", "-lW", binary], text=True)
assert any("Type:" in line and "DYN" in line for line in header.splitlines()), "Node must be PIE"
assert any("FLAGS_1" in line and "PIE" in line for line in dynamic.splitlines()), "Missing PIE flag"
assert "BIND_NOW" in dynamic and "GNU_RELRO" in segments, "Missing full RELRO"
stack = next(line for line in segments.splitlines() if "GNU_STACK" in line)
assert "RWE" not in stack, "Executable stack is forbidden"
print("Node ELF hardening: PIE, full RELRO, non-executable stack verified")
PY

install -D -m 0644 LICENSE /opt/node/usr/share/licenses/nodejs/LICENSE
mkdir -p /opt/node/usr/share/doc/nodejs
printf '{"version":"%s","source":"https://nodejs.org/dist/v%s/node-v%s.tar.xz","sha256":"%s","openssl":"RHEL system library","fipsPatchSha256":"%s"}\n' \
  "$NODE_VERSION" "$NODE_VERSION" "$NODE_VERSION" "$NODE_SOURCE_SHA256" \
  "$(sha256sum "$SCRIPT_DIR/0001-fips-disable-options.patch" | cut -d ' ' -f 1)" \
  > /opt/node/usr/share/doc/nodejs/build-info.json

# OPENSSL_FORCE_FIPS_MODE=1 puts RHEL's OpenSSL into FIPS mode without a FIPS
# kernel; a Node that bypasses the system OpenSSL stays out of it.
readonly NODE_BIN=/opt/node/usr/bin/node
test "$("$NODE_BIN" --version)" = "v${NODE_VERSION}"
"$NODE_BIN" -e 'require("node:assert/strict").equal(process.config.variables.node_shared_openssl, true)'
OPENSSL_FORCE_FIPS_MODE=1 "$NODE_BIN" -e '
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
assert.equal(crypto.getFips(), 1, "FIPS provider not active under OPENSSL_FORCE_FIPS_MODE=1");
assert.throws(() => crypto.createHash("md5"), { code: "ERR_OSSL_EVP_UNSUPPORTED" });
'
echo "Node ${NODE_VERSION}: system OpenSSL $("$NODE_BIN" -p process.versions.openssl), FIPS mode verified"
