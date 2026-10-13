#!/bin/sh
set -eu

# Apply the local Native encoder patch to the clickhouse-rs client crate.

crate_version=0.15.2
crate_sha256=7654154fde4d97ec1321bfe4c3965570be6fcd09e091da8afc3166ab5ee27be2
package_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_root="${package_dir}/target/.clickhouse-source"
source_dir="${source_root}/clickhouse-${crate_version}"
archive="${source_root}/clickhouse-${crate_version}.crate"
patch_file="${package_dir}/patches/clickhouse-${crate_version}-native-encoder.patch"
marker="${source_dir}/.langfuse-native-encoder-patched"
config_dir="${package_dir}/.cargo"

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  else
    shasum -a 256 "$1" | cut -d ' ' -f 1
  fi
}

patch_sha256="$(checksum "$patch_file")"

if [ ! -f "$marker" ] || [ "$(cat "$marker")" != "$patch_sha256" ]; then
  mkdir -p "$source_root"
  curl --fail --location --retry 3 --retry-delay 2 --retry-all-errors --silent --show-error \
    --user-agent 'langfuse-native-build/0.1 (https://github.com/langfuse/langfuse)' \
    "https://crates.io/api/v1/crates/clickhouse/${crate_version}/download" \
    --output "$archive"

  if [ "$(checksum "$archive")" != "$crate_sha256" ]; then
    echo "clickhouse ${crate_version} archive checksum mismatch" >&2
    exit 1
  fi

  rm -rf "$source_dir"
  tar -xzf "$archive" -C "$source_root"
  patch --directory="$source_dir" --strip=1 < "$patch_file"
  printf '%s' "$patch_sha256" > "$marker"
fi

mkdir -p "$config_dir"
cat > "$config_dir/config.toml" <<EOF
[patch.crates-io]
clickhouse = { path = "${source_dir}" }
EOF
