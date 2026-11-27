# Sourced by up.sh, down.sh and drop.sh.
#
# With CLICKHOUSE_AUTH_MODE=jwt, migrations authenticate with the same access
# token as the application. The migrate CLI cannot send one, so they run through
# clickhouse-jwt-migrate (../jwt-migrate), which wraps the same migration
# driver. Setting CLICKHOUSE_MIGRATION_USER keeps migrations on that user and
# CLICKHOUSE_MIGRATION_PASSWORD instead.
MIGRATE_WITH_JWT="false"
if [ "$CLICKHOUSE_AUTH_MODE" = "jwt" ] && [ -z "${CLICKHOUSE_MIGRATION_USER}" ]; then
  MIGRATE_WITH_JWT="true"
  if ! command -v clickhouse-jwt-migrate >/dev/null 2>&1
  then
      echo "Error: clickhouse-jwt-migrate is not installed or not in PATH."
      echo "The Langfuse web image includes it. Elsewhere, build it with"
      echo "'go build -o clickhouse-jwt-migrate .' in packages/shared/clickhouse/jwt-migrate."
      exit 1
  fi
fi

# Usage: jwt_migrate <migrations directory> <migrations table engine> <cluster> <command...>
# <cluster> is the percent-encoded value of the migrate URL's x-cluster-name, or
# empty without a cluster.
jwt_migrate() {
  _jwt_migrate_source="$1"
  _jwt_migrate_engine="$2"
  _jwt_migrate_cluster="$3"
  shift 3
  # clickhouse-jwt-migrate reads the connection and the token source from the
  # environment. Values loaded from .env are shell variables until exported.
  export CLICKHOUSE_MIGRATION_URL CLICKHOUSE_MIGRATION_SSL CLICKHOUSE_DB \
    CLICKHOUSE_JWT_TOKEN CLICKHOUSE_JWT_TOKEN_FILE CLICKHOUSE_JWT_TOKEN_URL \
    CLICKHOUSE_JWT_CLIENT_ID CLICKHOUSE_JWT_CLIENT_SECRET \
    CLICKHOUSE_JWT_CLIENT_SECRET_FILE \
    CLICKHOUSE_JWT_CLIENT_AUTH_METHOD CLICKHOUSE_JWT_SCOPE CLICKHOUSE_JWT_AUDIENCE
  clickhouse-jwt-migrate -source "$_jwt_migrate_source" \
    -table-engine "$_jwt_migrate_engine" -cluster "$_jwt_migrate_cluster" "$@"
}
