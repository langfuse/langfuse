#!/usr/bin/env bash
set -euo pipefail

readonly NODE_VERSION=24.22.1

case "${TARGETARCH:?TARGETARCH must be set}" in
  amd64)
    NODE_ARCH=x64
    NODE_SHA256=6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6
    ;;
  arm64)
    NODE_ARCH=arm64
    NODE_SHA256=dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e
    ;;
  *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;;
esac
readonly NODE_ARCH NODE_SHA256
readonly NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"

mkdir -p /opt/node/usr
curl --fail --show-error --location --retry 3 \
  --output /tmp/node.tar.xz "$NODE_URL"
printf '%s  /tmp/node.tar.xz\n' "$NODE_SHA256" | sha256sum --check --strict -
tar -xJf /tmp/node.tar.xz --strip-components=1 -C /opt/node/usr
rm /tmp/node.tar.xz

# npm and headers stay in build stages; runtimes receive only the executable.
install -D -m 0644 /opt/node/usr/LICENSE /opt/node/usr/share/licenses/nodejs/LICENSE
mkdir -p /opt/node/usr/share/doc/nodejs
printf '{"version":"%s","source":"%s","sha256":"%s","openssl":"upstream bundled library"}\n' \
  "$NODE_VERSION" "$NODE_URL" "$NODE_SHA256" \
  > /opt/node/usr/share/doc/nodejs/build-info.json

test "$(/opt/node/usr/bin/node --version)" = "v${NODE_VERSION}"
