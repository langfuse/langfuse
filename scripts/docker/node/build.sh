#!/usr/bin/env bash
set -euo pipefail

readonly NODE_VERSION=24.22.1
readonly NODE_SOURCE_SHA256=4f5379796280cdaeb0c2f358fd04b6a16cc4fb7dfa83b5a8c91a9d963b435231
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly BUILD_JOBS="${NODE_BUILD_JOBS:-4}"

if [[ ! "$BUILD_JOBS" =~ ^[1-9][0-9]*$ ]]; then
  echo "NODE_BUILD_JOBS must be a positive integer" >&2
  exit 1
fi

# UBI9's default GCC is too old for Node24. This toolset links against UBI's
# runtime libraries, so its compiler packages do not belong in the final image.
set +u
source /opt/rh/gcc-toolset-12/enable
set -u
export CFLAGS="-O3 -fPIE -fstack-protector-strong -fstack-clash-protection -D_FORTIFY_SOURCE=2 -D_GLIBCXX_ASSERTIONS -DOPENSSL_NO_ENGINE -D_LARGEFILE_SOURCE -D_FILE_OFFSET_BITS=64 -fno-ipa-icf"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-pie -Wl,-z,relro,-z,now"

mkdir -p /build/node
cd /build/node
curl --fail --show-error --location --retry 3 \
  --output node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.tar.xz"
printf '%s  node.tar.xz\n' "$NODE_SOURCE_SHA256" | sha256sum --check --strict -
tar -xJf node.tar.xz --strip-components=1

# RHEL controls FIPS through system OpenSSL configuration, including its
# restrictions on Node's command-line and JavaScript FIPS toggles.
patch --batch --forward --fuzz=0 -p1 < "$SCRIPT_DIR/rhel-fips.patch"

# Keep the patched upstream dependencies, full ICU, and npm for application
# builds. Only OpenSSL is supplied by RHEL; --shared would instead split Node
# itself into a separate libnode and is deliberately unnecessary here.
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
printf '{"version":"%s","source":"https://nodejs.org/dist/v%s/node-v%s.tar.xz","sha256":"%s","openssl":"RHEL system library","fipsPolicyPatchSha256":"%s"}\n' \
  "$NODE_VERSION" "$NODE_VERSION" "$NODE_VERSION" "$NODE_SOURCE_SHA256" \
  "$(sha256sum "$SCRIPT_DIR/rhel-fips.patch" | cut -d ' ' -f 1)" \
  > /opt/node/usr/share/doc/nodejs/build-info.json

test "$(/opt/node/usr/bin/node --version)" = "v${NODE_VERSION}"
/opt/node/usr/bin/node -e 'require("node:assert/strict").equal(process.config.variables.node_shared_openssl, true)'
