#!/bin/sh
# Runs a `prisma migrate` command against a CockroachDB database.
#
# `prisma migrate` refuses a CockroachDB server while the schema's provider is
# "postgresql", and some migrations use SQL that CockroachDB does not support.
# This script assembles a temporary migrations folder:
#
#   - every migration from ../migrations,
#   - with the file from ./overrides/<migration>/migration.sql in place of the
#     original wherever CockroachDB needs different SQL,
#   - a lock file and a datasource-only schema with provider "cockroachdb",
#
# and runs `prisma migrate <command>` on it. The migration names stay the same,
# so `_prisma_migrations` records the same history as on PostgreSQL.
#
# The runtime Prisma client keeps provider "postgresql"; only migrations need
# the CockroachDB provider.
#
# Usage:
#   DIRECT_URL=postgresql://user@host:26257/db sh migrate.sh [command [args]]
# The command defaults to `deploy`. Examples: `status`,
# `resolve --rolled-back <migration>`. DATABASE_URL is used when DIRECT_URL is
# not set. The temporary folder goes to TMPDIR (default /tmp), which must be
# writable.
#
# Differences from `prisma migrate deploy` on PostgreSQL:
# - A migration is not atomic. Each statement outside an explicit BEGIN/COMMIT
#   commits on its own (see enable_implicit_transaction_for_batch_statements
#   below), and CockroachDB commits an explicit transaction before each DDL
#   statement in it. A failed migration leaves its earlier statements applied. To
#   recover, undo or finish those statements by hand, then run
#   `migrate.sh resolve --rolled-back <migration>` (or `--applied`) and deploy
#   again.
# - Prisma takes no lock against concurrent runs on CockroachDB. A second run
#   usually stops with P3009 on the first run's unfinished migration, but two
#   runs can apply the same migration. Run this from one process at a time;
#   with several web replicas, let one apply migrations and set
#   LANGFUSE_AUTO_POSTGRES_MIGRATION_DISABLED=true on the others.
# - Prisma stores a checksum of the file it applied. An override that was
#   released must not change: an installation that already applied it would
#   keep the old SQL. Correct a released override with a new migration.

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
migrations_dir="$script_dir/../migrations"
overrides_dir="$script_dir/overrides"

url="${DIRECT_URL:-${DATABASE_URL:-}}"
if [ -z "$url" ]; then
    echo "Error: set DIRECT_URL or DATABASE_URL to the CockroachDB connection string." >&2
    exit 1
fi

if [ "$#" -eq 0 ]; then
    set -- deploy
fi

# Session settings the migrations need on CockroachDB:
# - experimental_enable_temp_tables=on: some data migrations stage rows in a
#   temporary table.
# - enable_implicit_transaction_for_batch_statements=false: Prisma sends each
#   migration file as one batch. By default CockroachDB runs a batch as one
#   implicit transaction, in which a statement cannot use a column that an
#   earlier statement added. The default does not make a migration atomic
#   either: autocommit_before_ddl commits the open transaction before each DDL
#   statement. With this off, each statement outside an explicit BEGIN/COMMIT
#   runs in its own transaction.
# - default_int_size=4: INTEGER is 64-bit on CockroachDB by default. The Prisma
#   client uses the PostgreSQL provider, which maps Int to a 32-bit INTEGER.
session_options="-c%20experimental_enable_temp_tables%3Don%20-c%20enable_implicit_transaction_for_batch_statements%3Dfalse%20-c%20default_int_size%3D4"
case "$url" in
    *\?) base="${url%\?}" query="" ;;
    *\?*) base="${url%%\?*}" query="&${url#*\?}" ;;
    *) base="$url" query="" ;;
esac
case "$query" in
    *\&options=*)
        # Keep options that are already there, such as a CockroachDB Cloud
        # cluster routing id.
        query_head="${query%%\&options=*}"
        query_tail="${query#*\&options=}"
        case "$query_tail" in
            "" | \&*) query="${query_head}&options=${session_options}${query_tail}" ;;
            *) query="${query_head}&options=${session_options}%20${query_tail}" ;;
        esac
        ;;
    *) query="${query}&options=${session_options}" ;;
esac
url="${base}?${query#\&}"

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir "$work_dir/migrations"
cp -R "$migrations_dir/." "$work_dir/migrations/"

if [ -d "$overrides_dir" ]; then
    for override in "$overrides_dir"/*/; do
        [ -d "$override" ] || continue
        name=$(basename "$override")
        if [ ! -d "$migrations_dir/$name" ]; then
            echo "Error: override '$name' has no matching migration in $migrations_dir." >&2
            exit 1
        fi
        cp "$override/migration.sql" "$work_dir/migrations/$name/migration.sql"
    done
fi

# Prisma's CockroachDB migration engine turns the declarative schema changer
# off for its session, but recent CockroachDB versions implement column type
# changes only in the declarative schema changer. Each migration starts by
# restoring CockroachDB's default.
for migration in "$work_dir"/migrations/*/migration.sql; do
    {
        printf 'SET use_declarative_schema_changer = on;\n'
        cat "$migration"
    } > "$migration.tmp"
    mv "$migration.tmp" "$migration"
done

printf 'provider = "cockroachdb"\n' > "$work_dir/migrations/migration_lock.toml"
cat > "$work_dir/schema.prisma" <<'EOF'
datasource db {
  provider = "cockroachdb"
  url      = env("LANGFUSE_COCKROACHDB_MIGRATION_URL")
}
EOF

LANGFUSE_COCKROACHDB_MIGRATION_URL="$url" prisma migrate "$@" --schema="$work_dir/schema.prisma"
