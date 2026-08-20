#!/bin/bash

CLICKHOUSE_CLUSTER_NAME_PLACEHOLDER="{CLICKHOUSE_CLUSTER_NAME}"

prepare_clustered_migrations() {
  local source_dir="$1"
  local cluster_name="$2"
  local target_dir
  local file
  local cluster_clause_count
  local placeholder_clause_count
  local rendered_clause_count
  local -a source_files

  if [ ! -d "$source_dir" ]; then
    echo "Error: clustered migration directory does not exist: $source_dir" >&2
    return 1
  fi

  if [ -z "$cluster_name" ]; then
    echo "Error: ClickHouse cluster name must not be empty." >&2
    return 1
  fi

  # The same value is interpolated into SQL and passed as a URL query value to
  # the golang-migrate ClickHouse driver. Restrict it to an unreserved subset
  # used by ClickHouse and managed providers so both representations stay safe.
  case "$cluster_name" in
    *[!A-Za-z0-9_.-]*)
      echo "Error: invalid ClickHouse cluster name '$cluster_name'. Allowed characters: A-Z, a-z, 0-9, _, ., -." >&2
      return 1
      ;;
  esac

  source_files=("$source_dir"/*.sql)
  if [ ! -e "${source_files[0]}" ]; then
    echo "Error: no clustered migration SQL files found in $source_dir." >&2
    return 1
  fi

  target_dir="$(mktemp -d "${TMPDIR:-/tmp}/langfuse-clickhouse-migrations.XXXXXX")" || {
    echo "Error: failed to create a temporary migration directory." >&2
    return 1
  }

  if ! cp "${source_files[@]}" "$target_dir/"; then
    echo "Error: failed to copy clustered migrations from $source_dir." >&2
    rm -rf "$target_dir"
    return 1
  fi

  for file in "$target_dir"/*.sql; do
    cluster_clause_count="$(grep -F -o "ON CLUSTER" "$file" | wc -l | tr -d '[:space:]')"
    placeholder_clause_count="$(grep -F -o "ON CLUSTER $CLICKHOUSE_CLUSTER_NAME_PLACEHOLDER" "$file" | wc -l | tr -d '[:space:]')"

    if [ "$cluster_clause_count" -eq 0 ] || [ "$cluster_clause_count" -ne "$placeholder_clause_count" ]; then
      echo "Error: every ON CLUSTER clause must use $CLICKHOUSE_CLUSTER_NAME_PLACEHOLDER in $file." >&2
      rm -rf "$target_dir"
      return 1
    fi

    if ! sed "s|$CLICKHOUSE_CLUSTER_NAME_PLACEHOLDER|'$cluster_name'|g" "$file" > "$file.tmp" || ! mv "$file.tmp" "$file"; then
      echo "Error: failed to render ClickHouse cluster name in $file." >&2
      rm -rf "$target_dir"
      return 1
    fi

    if grep -Fq "$CLICKHOUSE_CLUSTER_NAME_PLACEHOLDER" "$file"; then
      echo "Error: unrendered ClickHouse cluster placeholder remains in $file." >&2
      rm -rf "$target_dir"
      return 1
    fi

    rendered_clause_count="$(grep -F -o "ON CLUSTER '$cluster_name'" "$file" | wc -l | tr -d '[:space:]')"
    if [ "$rendered_clause_count" -ne "$cluster_clause_count" ]; then
      echo "Error: not every ON CLUSTER clause was rendered in $file." >&2
      rm -rf "$target_dir"
      return 1
    fi
  done

  printf '%s\n' "$target_dir"
}
