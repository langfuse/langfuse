#!/usr/bin/env bash

set -euo pipefail

CODEX_SERVICES_ROOT="${CODEX_SERVICES_ROOT:-$PWD/.codex/services}"
# NOTE: POSTGRES_PORT and POSTGRES_USER are effectively immutable once
# `$CODEX_SERVICES_ROOT/postgres/data` is initialized. Changing either value on
# reruns requires deleting the initialized Postgres data directory and allowing
# `initdb` to recreate the cluster with the new settings.
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
CLICKHOUSE_HTTP_PORT="${CLICKHOUSE_HTTP_PORT:-8123}"
CLICKHOUSE_NATIVE_PORT="${CLICKHOUSE_NATIVE_PORT:-9000}"
MINIO_API_PORT="${MINIO_API_PORT:-9090}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9091}"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
REDIS_AUTH="${REDIS_AUTH:-myredissecret}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-clickhouse}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-clickhouse}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minio}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-miniosecret}"

MINIO_RELEASE_TAG="${MINIO_RELEASE_TAG:-RELEASE.2025-09-07T16-13-09Z}"
MC_RELEASE_TAG="${MC_RELEASE_TAG:-RELEASE.2025-08-13T08-35-41Z}"
MINIO_SHA256_AMD64="${MINIO_SHA256_AMD64:-7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f}"
MINIO_SHA256_ARM64="${MINIO_SHA256_ARM64:-5c83cd2cf151717ba0243f73e1c7802ff36e272b67144bdd7f1f7d684fd6f03d}"
MC_SHA256_AMD64="${MC_SHA256_AMD64:-01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891}"
MC_SHA256_ARM64="${MC_SHA256_ARM64:-14c8c9616cfce4636add161304353244e8de383b2e2752c0e9dad01d4c27c12c}"
MIGRATE_RELEASE_TAG="${MIGRATE_RELEASE_TAG:-v4.19.1}"
MIGRATE_SHA256_AMD64="${MIGRATE_SHA256_AMD64:-2ac648fbd1b127b69ab5a7b33cf96212178f71e22379fc50573630c6f4c7ce18}"
MIGRATE_SHA256_ARM64="${MIGRATE_SHA256_ARM64:-2fea2455c0f3f07cc3f4b98471c951ad1a716059574b20b6416bd1e9058751c5}"

export DEBIAN_FRONTEND=noninteractive

ensure_apt_package() {
  local package="$1"

  if dpkg -s "$package" >/dev/null 2>&1; then
    return 0
  fi

  if [ -z "${CODEX_APT_UPDATED:-}" ]; then
    apt-get update
    CODEX_APT_UPDATED=1
  fi

  apt-get install -y "$package"
}

stop_service_if_running() {
  local service_name="$1"

  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$service_name" >/dev/null 2>&1 || true
  fi

  if command -v service >/dev/null 2>&1; then
    service "$service_name" stop >/dev/null 2>&1 || true
  fi
}

stop_system_postgres_clusters() {
  if command -v pg_lsclusters >/dev/null 2>&1 && command -v pg_ctlcluster >/dev/null 2>&1; then
    while read -r version cluster_name _ status _; do
      if [ "$status" = "online" ]; then
        pg_ctlcluster "$version" "$cluster_name" stop >/dev/null 2>&1 || true
      fi
    done < <(pg_lsclusters --no-header 2>/dev/null || true)
  fi

  stop_service_if_running postgresql
}

ensure_clickhouse_repo() {
  ensure_apt_package ca-certificates
  ensure_apt_package curl
  ensure_apt_package gnupg

  local keyring="/etc/apt/keyrings/clickhouse.gpg"
  local source_file="/etc/apt/sources.list.d/clickhouse.list"

  mkdir -p /etc/apt/keyrings

  if [ ! -f "$keyring" ]; then
    curl -fsSL https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key \
      | gpg --dearmor -o "$keyring"
  fi

  if [ ! -f "$source_file" ]; then
    echo "deb [signed-by=$keyring] https://packages.clickhouse.com/deb stable main" > "$source_file"
    apt-get update
  fi
}

ensure_postgres_binaries() {
  ensure_apt_package postgresql
  ensure_apt_package postgresql-client
  stop_system_postgres_clusters
}

ensure_redis_binary() {
  ensure_apt_package redis-server
  stop_service_if_running redis-server
}

ensure_clickhouse_binaries() {
  if command -v clickhouse-server >/dev/null 2>&1 && command -v clickhouse-client >/dev/null 2>&1; then
    stop_service_if_running clickhouse-server
    return 0
  fi

  ensure_clickhouse_repo
  apt-get install -y clickhouse-server clickhouse-client
  stop_service_if_running clickhouse-server
}

detect_migrate_arch() {
  local machine_arch
  machine_arch="$(uname -m)"

  case "$machine_arch" in
    x86_64|amd64)
      echo "amd64"
      ;;
    aarch64|arm64)
      echo "arm64"
      ;;
    *)
      echo "Unsupported architecture for golang-migrate binary: $machine_arch" >&2
      exit 1
      ;;
  esac
}

ensure_migrate_binary() {
  if command -v migrate >/dev/null 2>&1; then
    return 0
  fi

  ensure_apt_package ca-certificates
  ensure_apt_package curl

  local migrate_arch
  local migrate_sha256
  local tmp_dir
  migrate_arch="$(detect_migrate_arch)"
  case "$migrate_arch" in
    amd64)
      migrate_sha256="$MIGRATE_SHA256_AMD64"
      ;;
    arm64)
      migrate_sha256="$MIGRATE_SHA256_ARM64"
      ;;
  esac
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN

  download_and_verify_sha256 \
    "https://github.com/golang-migrate/migrate/releases/download/${MIGRATE_RELEASE_TAG}/migrate.linux-${migrate_arch}.tar.gz" \
    "$tmp_dir/migrate.tar.gz" \
    "$migrate_sha256"
  tar -xzf "$tmp_dir/migrate.tar.gz" -C "$tmp_dir" migrate
  install -m 0755 "$tmp_dir/migrate" /usr/local/bin/migrate
}

detect_minio_arch() {
  local machine_arch
  machine_arch="$(uname -m)"

  case "$machine_arch" in
    x86_64|amd64)
      echo "amd64"
      ;;
    aarch64|arm64)
      echo "arm64"
      ;;
    *)
      echo "Unsupported architecture for MinIO binaries: $machine_arch" >&2
      exit 1
      ;;
  esac
}

download_and_verify_sha256() {
  local url="$1"
  local output_path="$2"
  local expected_sha256="$3"
  local tmp_download

  tmp_download="$(mktemp)"
  trap 'rm -f "$tmp_download"' RETURN
  curl -fsSL "$url" -o "$tmp_download"

  local actual_sha256
  actual_sha256="$(sha256sum "$tmp_download" | awk '{print $1}')"

  if [ "$actual_sha256" != "$expected_sha256" ]; then
    echo "SHA256 mismatch for $url" >&2
    echo "expected: $expected_sha256" >&2
    echo "actual:   $actual_sha256" >&2
    return 1
  fi

  mv "$tmp_download" "$output_path"
  trap - RETURN
}

ensure_minio_binaries() {
  local bin_dir="$CODEX_SERVICES_ROOT/bin"
  local minio_arch
  local minio_sha256
  local mc_sha256

  mkdir -p "$bin_dir"
  minio_arch="$(detect_minio_arch)"

  case "$minio_arch" in
    amd64)
      minio_sha256="$MINIO_SHA256_AMD64"
      mc_sha256="$MC_SHA256_AMD64"
      ;;
    arm64)
      minio_sha256="$MINIO_SHA256_ARM64"
      mc_sha256="$MC_SHA256_ARM64"
      ;;
  esac

  if [ ! -x "$bin_dir/minio" ]; then
    download_and_verify_sha256 \
      "https://dl.min.io/server/minio/release/linux-${minio_arch}/archive/minio.${MINIO_RELEASE_TAG}" \
      "$bin_dir/minio" \
      "$minio_sha256"
    chmod +x "$bin_dir/minio"
  fi

  if [ ! -x "$bin_dir/mc" ]; then
    download_and_verify_sha256 \
      "https://dl.min.io/client/mc/release/linux-${minio_arch}/archive/mc.${MC_RELEASE_TAG}" \
      "$bin_dir/mc" \
      "$mc_sha256"
    chmod +x "$bin_dir/mc"
  fi

  export PATH="$bin_dir:$PATH"
}

find_postgres_bin() {
  local name="$1"

  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi

  find /usr/lib/postgresql -type f -name "$name" 2>/dev/null | sort -V | tail -n 1
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local timeout_seconds="${3:-45}"
  local deadline=$((SECONDS + timeout_seconds))

  until (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      return 1
    fi
    sleep 1
  done
}

wait_for_http() {
  local url="$1"
  local timeout_seconds="${2:-45}"
  local deadline=$((SECONDS + timeout_seconds))

  until curl -fsS "$url" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      return 1
    fi
    sleep 1
  done
}

escape_sql_literal() {
  local value="$1"
  value="${value//\\/\\\\}"
  printf "%s" "${value//\'/\'\'}"
}

escape_clickhouse_identifier() {
  local value="$1"
  printf '`%s`' "${value//\`/\`\`}"
}

escape_redis_config_string() {
  local value="$1"
  # Redis treats backslashes and double-quotes as escape delimiters inside
  # quoted config strings, so both must be escaped before writing requirepass.
  value="${value//\\/\\\\}"
  value="${value//$'\n'/\\n}"
  value="${value//\"/\\\"}"
  printf "%s" "$value"
}

ensure_postgres_running() {
  ensure_postgres_binaries

  local initdb
  local pg_ctl
  local psql
  local pg_isready

  initdb="$(find_postgres_bin initdb)"
  pg_ctl="$(find_postgres_bin pg_ctl)"
  psql="$(find_postgres_bin psql)"
  pg_isready="$(find_postgres_bin pg_isready)"

  if [ -z "$initdb" ] || [ -z "$pg_ctl" ] || [ -z "$psql" ] || [ -z "$pg_isready" ]; then
    echo "Unable to find required PostgreSQL binaries (initdb, pg_ctl, psql, pg_isready)."
    exit 1
  fi

  local pg_root="$CODEX_SERVICES_ROOT/postgres"
  local pg_data="$pg_root/data"
  local pg_log="$pg_root/postgres.log"
  local pg_socket_dir="$pg_root"
  local -a pg_runner

  mkdir -p "$pg_root"

  if [ "${EUID:-$(id -u)}" -eq 0 ] && id -u postgres >/dev/null 2>&1; then
    chown -R postgres:postgres "$pg_root"
    pg_runner=(runuser -u postgres --)
  else
    pg_runner=()
  fi

  if [ ! -f "$pg_data/PG_VERSION" ]; then
    "${pg_runner[@]}" "$initdb" -D "$pg_data" -U "$POSTGRES_USER" --auth-host=md5 --auth-local=trust >/dev/null
    {
      echo "listen_addresses = '127.0.0.1'"
      echo "port = $POSTGRES_PORT"
      echo "log_statement = 'all'"
      echo "timezone = 'UTC'"
      echo "unix_socket_directories = '$pg_socket_dir'"
    } >> "$pg_data/postgresql.conf"
  fi

  if ! "${pg_runner[@]}" "$pg_ctl" -D "$pg_data" status >/dev/null 2>&1; then
    "${pg_runner[@]}" "$pg_ctl" -D "$pg_data" -l "$pg_log" -w start
  fi

  if ! "$pg_isready" -h "$pg_socket_dir" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1; then
    echo "PostgreSQL did not become ready on socket $pg_socket_dir (port $POSTGRES_PORT)"
    exit 1
  fi

  PGPASSWORD="${POSTGRES_PASSWORD}" "${pg_runner[@]}" "$psql" -h "$pg_socket_dir" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -v postgres_user="$POSTGRES_USER" -v postgres_db="$POSTGRES_DB" -v postgres_password="$POSTGRES_PASSWORD" <<SQL >/dev/null
SELECT format('ALTER USER %I WITH PASSWORD %L', :'postgres_user', :'postgres_password')\gexec
SELECT format('CREATE DATABASE %I', :'postgres_db')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'postgres_db')\gexec
SQL
}

ensure_redis_running() {
  ensure_redis_binary

  local redis_root="$CODEX_SERVICES_ROOT/redis"
  local redis_conf="$redis_root/redis.conf"
  local redis_log="$redis_root/redis.log"
  local redis_pid="$redis_root/redis.pid"
  local redis_auth_escaped

  mkdir -p "$redis_root"

  if wait_for_port 127.0.0.1 "$REDIS_PORT" 1; then
    echo "Redis already running on 127.0.0.1:$REDIS_PORT; keeping existing runtime config."
    return 0
  fi

  redis_auth_escaped="$(escape_redis_config_string "$REDIS_AUTH")"

  cat > "$redis_conf" <<CONF
bind 127.0.0.1
port $REDIS_PORT
requirepass "$redis_auth_escaped"
maxmemory-policy noeviction
daemonize yes
pidfile "$redis_pid"
logfile "$redis_log"
dir "$redis_root"
CONF

  redis-server "$redis_conf"

  if ! wait_for_port 127.0.0.1 "$REDIS_PORT" 30; then
    echo "Redis did not start on 127.0.0.1:$REDIS_PORT"
    exit 1
  fi
}

ensure_clickhouse_running() {
  ensure_clickhouse_binaries

  local clickhouse_root="$CODEX_SERVICES_ROOT/clickhouse"
  local clickhouse_data="$clickhouse_root/data"
  local clickhouse_log="$clickhouse_root/clickhouse.log"
  local clickhouse_err="$clickhouse_root/clickhouse.err.log"
  local clickhouse_pid="$clickhouse_root/clickhouse.pid"
  local -a clickhouse_runner

  mkdir -p "$clickhouse_data"
  if [ "${EUID:-$(id -u)}" -eq 0 ] && id -u clickhouse >/dev/null 2>&1; then
    chown -R clickhouse:clickhouse "$clickhouse_root"
    clickhouse_runner=(runuser -u clickhouse --)
  else
    clickhouse_runner=()
  fi

  if ! wait_for_http "http://127.0.0.1:$CLICKHOUSE_HTTP_PORT/ping" 1; then
    "${clickhouse_runner[@]}" clickhouse-server \
      --daemon \
      --config-file=/etc/clickhouse-server/config.xml \
      --pid-file="$clickhouse_pid" \
      --log-file="$clickhouse_log" \
      --errorlog-file="$clickhouse_err" \
      -- \
      --path="$clickhouse_data" \
      --http_port="$CLICKHOUSE_HTTP_PORT" \
      --tcp_port="$CLICKHOUSE_NATIVE_PORT"
  fi

  if ! wait_for_http "http://127.0.0.1:$CLICKHOUSE_HTTP_PORT/ping" 45; then
    echo "ClickHouse did not start on 127.0.0.1:$CLICKHOUSE_HTTP_PORT"
    exit 1
  fi

  local clickhouse_password_sql
  local clickhouse_user_identifier
  clickhouse_password_sql="$(escape_sql_literal "$CLICKHOUSE_PASSWORD")"
  clickhouse_user_identifier="$(escape_clickhouse_identifier "$CLICKHOUSE_USER")"

  clickhouse-client --host 127.0.0.1 --port "$CLICKHOUSE_NATIVE_PORT" -q "CREATE USER IF NOT EXISTS $clickhouse_user_identifier IDENTIFIED WITH plaintext_password BY '$clickhouse_password_sql'"
  if ! clickhouse-client --host 127.0.0.1 --port "$CLICKHOUSE_NATIVE_PORT" -q "GRANT CURRENT GRANTS ON *.* TO $clickhouse_user_identifier" >/dev/null 2>&1; then
    clickhouse-client --host 127.0.0.1 --port "$CLICKHOUSE_NATIVE_PORT" -q "GRANT ALL ON *.* TO $clickhouse_user_identifier WITH GRANT OPTION"
  fi
}

ensure_minio_running() {
  ensure_minio_binaries

  local minio_root="$CODEX_SERVICES_ROOT/minio"
  local minio_data="$minio_root/data"
  local minio_log="$minio_root/minio.log"
  local minio_pid="$minio_root/minio.pid"
  local minio_already_running="false"

  mkdir -p "$minio_data"

  if wait_for_port 127.0.0.1 "$MINIO_API_PORT" 1; then
    echo "MinIO already running on 127.0.0.1:$MINIO_API_PORT; skipping server start."
    minio_already_running="true"
  fi

  if [ "$minio_already_running" != "true" ]; then
    (
      export MINIO_ROOT_USER MINIO_ROOT_PASSWORD
      nohup minio server \
        --address "127.0.0.1:$MINIO_API_PORT" \
        --console-address "127.0.0.1:$MINIO_CONSOLE_PORT" \
        "$minio_data" >"$minio_log" 2>&1 &
      echo $! > "$minio_pid"
    )
  fi

  if ! wait_for_port 127.0.0.1 "$MINIO_API_PORT" 45; then
    echo "MinIO did not start on 127.0.0.1:$MINIO_API_PORT"
    exit 1
  fi

  if ! mc alias set local "http://127.0.0.1:$MINIO_API_PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
    if [ "$minio_already_running" = "true" ]; then
      echo "MinIO is running but credentials do not match MINIO_ROOT_USER/MINIO_ROOT_PASSWORD; skipping bucket reconciliation."
      return 0
    fi

    echo "Failed to configure MinIO client alias for fresh MinIO startup."
    exit 1
  fi

  if ! mc mb --ignore-existing local/langfuse >/dev/null 2>&1; then
    if [ "$minio_already_running" = "true" ]; then
      echo "Failed to reconcile MinIO bucket 'langfuse'; will retry on next run."
      return 0
    fi

    echo "Failed to create MinIO bucket 'langfuse' after fresh startup."
    exit 1
  fi
}

ensure_cloud_dependencies() {
  mkdir -p "$CODEX_SERVICES_ROOT"

  ensure_migrate_binary
  ensure_postgres_running
  ensure_redis_running
  ensure_clickhouse_running
  ensure_minio_running

  echo "Cloud dependencies are installed and running:"
  echo "- PostgreSQL on 127.0.0.1:$POSTGRES_PORT"
  echo "- Redis on 127.0.0.1:$REDIS_PORT"
  echo "- ClickHouse HTTP on 127.0.0.1:$CLICKHOUSE_HTTP_PORT, native on 127.0.0.1:$CLICKHOUSE_NATIVE_PORT"
  echo "- MinIO API on 127.0.0.1:$MINIO_API_PORT, console on 127.0.0.1:$MINIO_CONSOLE_PORT"
}
