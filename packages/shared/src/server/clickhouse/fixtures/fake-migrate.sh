#!/bin/sh
set -eu

# `migrate version` reports the applied version on stderr, as golang-migrate does.
for argument in "$@"; do
  if [ "$argument" = "version" ]; then
    printf "%s\n" "${FAKE_MIGRATE_VERSION:-}" >&2
    exit 0
  fi
done

: > "$CAPTURED_ARGS_PATH"
for argument in "$@"; do
  printf "%s\n" "$argument" >> "$CAPTURED_ARGS_PATH"
done

source_uri=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-source" ]; then
    source_uri="$2"
    shift 2
  else
    shift
  fi
done

source_directory="${source_uri#file://}"
printf "%s" "$source_directory" > "$CAPTURED_SOURCE_PATH"
cp -R "$source_directory/." "$CAPTURED_MIGRATIONS_DIRECTORY"

if [ "${CAPTURE_STDIN:-false}" = "true" ]; then
  cat > "$CAPTURED_STDIN_PATH"
fi

exit "${MIGRATE_EXIT_CODE:-0}"
