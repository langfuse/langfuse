# ClickHouse Backfill - Rust Edition

## Overview

This tool backfills the ClickHouse `events` table from the `observations` table by:
1. Loading all trace attributes for a partition into memory
2. Streaming observations in batches using cursor-based pagination
3. Enriching each observation with trace-level data (user_id, session_id, metadata, tags, etc.)
4. Inserting enriched events into the `events` table with retry logic

## Installation

### macOS

#### 1. Install Rust

```bash
# Install rustup (Rust installer)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Follow the on-screen instructions, then reload your shell
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

#### 2. Clone and Build

```bash
# Navigate to the project directory
cd clickhouse-backfill-rust

# Build the release binary (optimized for performance)
cargo build --release

# The binary will be at: ./target/release/clickhouse-backfill-rust
```

#### 3. Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your ClickHouse connection details
nano .env
```

Edit the following variables in `.env`:
```bash
CLICKHOUSE_URL=http://your-clickhouse-host:8123
CLICKHOUSE_USER=your_username
CLICKHOUSE_PASSWORD=your_password
CLICKHOUSE_DB=default
PARTITION=202511  # YYYYMM format
```

#### 4. Run

```bash
# Dry run first (no inserts, validation only)
./target/release/clickhouse-backfill-rust --partition 202511 --dry-run

# Actual run
./target/release/clickhouse-backfill-rust --partition 202511

# With custom batch size
./target/release/clickhouse-backfill-rust --partition 202511 --batch-size 20000
```

---

### AWS EC2 (Amazon Linux 2023 / AL2)

#### 1. Install System Dependencies

```bash
# Update system
sudo yum update -y

# Install development tools
sudo yum groupinstall "Development Tools" -y

# Install OpenSSL development headers (required for HTTPS support)
sudo yum install openssl-devel -y

# Install pkg-config
sudo yum install pkg-config -y
```

#### 2. Install Rust

```bash
# Install rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Select default installation (option 1)
# Then reload shell
source $HOME/.cargo/env

# Verify installation
rustc --version
cargo --version
```

#### 3. Build on EC2

```bash
cd ~/clickhouse-backfill-rust

# Build release binary (this will take a few minutes)
cargo build --release

# Verify the binary was created
ls -lh target/release/clickhouse-backfill-rust
```

#### 4. Run on EC2

```bash
# Test with dry run
./target/release/clickhouse-backfill-rust --partition 202511 --dry-run

# Run the actual backfill
./target/release/clickhouse-backfill-rust --partition 202511

# Run in background with nohup
nohup ./target/release/clickhouse-backfill-rust --partition 202511 > backfill.log 2>&1 &

# Monitor progress
tail -f backfill.log
```
---

## Usage

### Command-Line Options

```bash
clickhouse-backfill-rust [OPTIONS]

Options:
  --partition <YYYYMM>              Partition to backfill (required)
  --clickhouse-url <URL>            ClickHouse server URL
  --clickhouse-user <USER>          ClickHouse username
  --clickhouse-password <PASS>      ClickHouse password
  --clickhouse-db <DB>              ClickHouse database name
  --batch-size <SIZE>               Events per insert batch [default: 10000]
  --stream-block-size <SIZE>        Observations per stream block [default: 50000]
  --dry-run                         Validate without inserting [default: false]
  --max-retries <NUM>               Max retry attempts [default: 3]
  --cursor-state-dir <PATH>         Directory for checkpoint file [default: .]
  --parallel-workers <NUM>          Parallel worker count [default: 4]
  -h, --help                        Print help
```

### Environment Variables

All options can be configured via environment variables (see `.env.example`):

- `PARTITION` - Partition to backfill (YYYYMM format)
- `CLICKHOUSE_URL` - ClickHouse server URL
- `CLICKHOUSE_USER` - Username
- `CLICKHOUSE_PASSWORD` - Password
- `CLICKHOUSE_DB` - Database name
- `BATCH_SIZE` - Events per batch
- `STREAM_BLOCK_SIZE` - Observations per stream
- `DRY_RUN` - Set to `true` for validation
- `MAX_RETRIES` - Retry attempts
- `RUST_LOG` - Log level (trace, debug, info, warn, error)

CLI arguments override environment variables.

## Resumability

The tool automatically saves checkpoints after each successful batch insert:

- **Checkpoint file**: `cursor_state_<partition>.json`
- **Location**: Current directory (configurable with `--cursor-state-dir`)
- **Format**: JSON with cursor position and rows processed

If the process is interrupted (Ctrl+C or crash), simply re-run the same command and it will resume from the last checkpoint.

To start fresh, delete the checkpoint file:
```bash
rm cursor_state_202511.json
```

## Performance Tuning

### Memory Requirements

Estimate memory usage for trace attributes:
- **Formula**: `(number of traces) × 100 bytes`
- **Example**: 15M traces ≈ 1.5GB RAM
- **Example**: 100M traces ≈ 10GB RAM

Ensure your system has sufficient RAM for the partition size.

### Batch Size Tuning

- **Smaller batches** (5k-10k): Lower memory, more checkpoints, slower
- **Larger batches** (20k-50k): Higher memory, fewer checkpoints, faster

Start with default (10k) and adjust based on:
- Available memory
- Network latency to ClickHouse
- Desired checkpoint granularity

### Stream Block Size

Controls how many observations are fetched per query:
- **Default**: 50,000
- **Larger values**: Fewer round-trips, more memory
- **Smaller values**: More round-trips, less memory

### Parallel Workers

The `--parallel-workers` setting controls concurrent processing (default: 4). Increase for more CPU cores.

## Troubleshooting

### Build Errors

**Error**: `error: linker 'cc' not found`
```bash
# macOS
xcode-select --install

# Amazon Linux
sudo yum groupinstall "Development Tools" -y
```

**Error**: `failed to run custom build command for openssl-sys`
```bash
# macOS
brew install openssl
export OPENSSL_DIR=$(brew --prefix openssl)

# Amazon Linux
sudo yum install openssl-devel -y
```

### Runtime Errors

**Error**: `Failed to connect to ClickHouse`
- Verify `CLICKHOUSE_URL` is correct (include protocol: `http://`)
- Check network connectivity: `curl http://your-clickhouse-host:8123`
- Verify credentials

**Error**: `Required table 'observations' does not exist`
- Ensure database name is correct
- Verify tables exist: `SELECT name FROM system.tables WHERE database = 'your_db'`

**Error**: `Out of memory`
- Reduce `--batch-size` and `--stream-block-size`
- Add swap space (see EC2 instructions above)
- Use a larger EC2 instance type

## Architecture

```
main.rs
  ├── config.rs           - CLI & env configuration
  ├── clickhouse.rs       - Client creation & connection
  ├── trace_loader.rs     - Load traces into memory (DashMap)
  ├── observation_streamer.rs - Cursor-based pagination
  ├── transformer.rs      - Observation → Event transformation
  ├── inserter.rs         - Batch inserts with retry
  ├── checkpoint.rs       - Cursor persistence & signal handling
  └── types.rs            - Data structures & helpers
```
