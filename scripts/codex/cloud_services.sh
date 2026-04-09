#!/usr/bin/env bash

set -euo pipefail

CODEX_SERVICES_ROOT="${CODEX_SERVICES_ROOT:-$PWD/.codex/services}"
POSTGRES_PORT="${POSTGRES_HOST_PORT:-5432}"
REDIS_PORT="${REDIS_HOST_PORT:-6379}"
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
}

ensure_redis_binary() {
  ensure_apt_package redis-server
}

ensure_clickhouse_binaries() {
  if command -v clickhouse-server >/dev/null 2>&1 && command -v clickhouse-client >/dev/null 2>&1; then
    return 0
  fi

  ensure_clickhouse_repo
  apt-get install -y clickhouse-server clickhouse-client
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

ensure_minio_binaries() {
  local bin_dir="$CODEX_SERVICES_ROOT/bin"
  local minio_arch
  mkdir -p "$bin_dir"
  minio_arch="$(detect_minio_arch)"

  if [ ! -x "$bin_dir/minio" ]; then
    curl -fsSL "https://dl.min.io/server/minio/release/linux-${minio_arch}/minio" -o "$bin_dir/minio"
    chmod +x "$bin_dir/minio"
  fi

  if [ ! -x "$bin_dir/mc" ]; then
    curl -fsSL "https://dl.min.io/client/mc/release/linux-${minio_arch}/mc" -o "$bin_dir/mc"
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
  printf "%s" "${value//\'/\'\'}"
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
  local pg_password_sql
  local -a pg_runner

  mkdir -p "$pg_root"
  pg_password_sql="$(escape_sql_literal "$POSTGRES_PASSWORD")"

  if [ "${EUID:-$(id -u)}" -eq 0 ] && id -u postgres >/dev/null 2>&1; then
    chown -R postgres:postgres "$pg_root"
    pg_runner=(runuser -u postgres --)
  else
    pg_runner=()
  fi

  if [ ! -f "$pg_data/PG_VERSION" ]; then
    "${pg_runner[@]}" "$initdb" -D "$pg_data" -U "$POSTGRES_USER" >/dev/null
    {
      echo "listen_addresses = '127.0.0.1'"
      echo "port = $POSTGRES_PORT"
      echo "log_statement = 'all'"
      echo "timezone = 'UTC'"
    } >> "$pg_data/postgresql.conf"

    {
      echo "host all all 127.0.0.1/32 md5"
      echo "host all all ::1/128 md5"
    } >> "$pg_data/pg_hba.conf"
  fi

  if ! "$pg_isready" -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1; then
    "${pg_runner[@]}" "$pg_ctl" -D "$pg_data" -l "$pg_log" -w start
  fi

  PGPASSWORD="${POSTGRES_PASSWORD}" "${pg_runner[@]}" "$psql" -h 127.0.0.1 -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres -v postgres_db="$POSTGRES_DB" <<SQL >/dev/null
ALTER USER "$POSTGRES_USER" WITH PASSWORD '$pg_password_sql';
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

  mkdir -p "$redis_root"

  cat > "$redis_conf" <<CONF
bind 127.0.0.1
port $REDIS_PORT
requirepass "$REDIS_AUTH"
maxmemory-policy noeviction
daemonize yes
pidfile $redis_pid
logfile $redis_log
dir $redis_root
CONF

  if ! wait_for_port 127.0.0.1 "$REDIS_PORT" 1; then
    redis-server "$redis_conf"
  fi

  if ! wait_for_port 127.0.0.1 "$REDIS_PORT" 30; then
    echo "Redis did not start on 127.0.0.1:$REDIS_PORT"
    exit 1
  fi
}

ensure_clickhouse_running() {
  ensure_clickhouse_binaries

  local clickhouse_root="$CODEX_SERVICES_ROOT/clickhouse"
  local clickhouse_log="$clickhouse_root/clickhouse.log"
  local clickhouse_err="$clickhouse_root/clickhouse.err.log"
  local clickhouse_pid="$clickhouse_root/clickhouse.pid"

  mkdir -p "$clickhouse_root"

  if ! wait_for_http "http://127.0.0.1:$CLICKHOUSE_HTTP_PORT/ping" 1; then
    clickhouse-server \
      --daemon \
      --config-file=/etc/clickhouse-server/config.xml \
      --pid-file="$clickhouse_pid" \
      --log-file="$clickhouse_log" \
      --errorlog-file="$clickhouse_err" \
      -- \
      --http_port="$CLICKHOUSE_HTTP_PORT" \
      --tcp_port="$CLICKHOUSE_NATIVE_PORT"
  fi

  if ! wait_for_http "http://127.0.0.1:$CLICKHOUSE_HTTP_PORT/ping" 45; then
    echo "ClickHouse did not start on 127.0.0.1:$CLICKHOUSE_HTTP_PORT"
    exit 1
  fi

  local clickhouse_password_sql
  clickhouse_password_sql="$(escape_sql_literal "$CLICKHOUSE_PASSWORD")"

  clickhouse-client --host 127.0.0.1 --port "$CLICKHOUSE_NATIVE_PORT" -q "CREATE USER IF NOT EXISTS $CLICKHOUSE_USER IDENTIFIED WITH plaintext_password BY '$clickhouse_password_sql'"
  clickhouse-client --host 127.0.0.1 --port "$CLICKHOUSE_NATIVE_PORT" -q "GRANT ALL ON *.* TO $CLICKHOUSE_USER WITH GRANT OPTION"
}

ensure_minio_running() {
  ensure_minio_binaries

  local minio_root="$CODEX_SERVICES_ROOT/minio"
  local minio_data="$minio_root/data"
  local minio_log="$minio_root/minio.log"
  local minio_pid="$minio_root/minio.pid"

  mkdir -p "$minio_data"

  if ! wait_for_port 127.0.0.1 "$MINIO_API_PORT" 1; then
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

  mc alias set local "http://127.0.0.1:$MINIO_API_PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  mc mb --ignore-existing local/langfuse >/dev/null
}

ensure_cloud_dependencies() {
  mkdir -p "$CODEX_SERVICES_ROOT"

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
