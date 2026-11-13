#!/usr/bin/env bash
# Install golang-migrate for ClickHouse migrations.
# A cache hit installs the restored binary and skips the download. A miss
# downloads the release tarball into MIGRATE_CACHE_DIR, which the workflow
# cache step saves at the end of the job.

set -euo pipefail

readonly MIGRATE_VERSION="${GOLANG_MIGRATE_VERSION:-v4.19.1}"
readonly MIGRATE_CACHE_DIR="${HOME}/.cache/golang-migrate/${MIGRATE_VERSION}"
readonly MIGRATE_BIN="${MIGRATE_CACHE_DIR}/migrate"

install_cached_binary() {
  sudo install -m 0755 "${MIGRATE_BIN}" /usr/bin/migrate
}

if [ "${MIGRATE_CACHE_HIT:-}" = "true" ] && [ -f "${MIGRATE_BIN}" ]; then
  install_cached_binary
  exit 0
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

curl --fail --location --retry 8 --retry-max-time 180 --retry-all-errors \
  --output "${tmpdir}/migrate.tar.gz" \
  "https://github.com/golang-migrate/migrate/releases/download/${MIGRATE_VERSION}/migrate.linux-amd64.tar.gz"

tar -xzf "${tmpdir}/migrate.tar.gz" -C "${tmpdir}" migrate
mkdir -p "${MIGRATE_CACHE_DIR}"
install -m 0755 "${tmpdir}/migrate" "${MIGRATE_BIN}"
install_cached_binary
