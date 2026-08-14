//! Path B engine: a long-running worker that processes ALL windows of a run
//! in one process and owns the commit protocol end to end — TRUNCATE staging,
//! GET raw objects, transform natively, stream one RowBinary INSERT per
//! window, row-count check, MOVE PARTITION (single-writer). One process per
//! run, not per batch: per-batch spawn used to cost ~50% of worker CPU.
//!
//! Everything streams. Downloads run as independent tasks feeding a bounded
//! prefetch queue; CPU workers parse each batch as a sequence and hand rows
//! to the writer the moment they exist; the writer feeds one long-lived
//! INSERT per window. Eager flushing is free on the ClickHouse side: within
//! one INSERT the server squashes chunks into min_insert_block_size blocks,
//! so part size is batch size and server settings, never client chunking.
//!
//! Budgets: POC_RW_NET_CONCURRENCY caps connections (size for the S3
//! bandwidth-delay product); POC_RW_MEMORY_BUDGET_MB caps BYTES held between
//! GET start and the batch's last row being written; POC_RW_SLOTS is the
//! staging-table pool (= in-flight windows); each window runs under
//! POC_RW_BATCH_TIMEOUT_S so a wedged connection fails the claim.
//!
//! Usage: rust-worker <s3_prefix> <window_id>...
//! Prints one JSON line per window as it commits, then {"summary": ...}.

mod otel;
mod row;
mod transform;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use futures::TryStreamExt;
use object_store::aws::AmazonS3Builder;
use object_store::path::Path as ObjPath;
use object_store::ObjectStore;
use serde::Deserialize;
use tokio::sync::{mpsc, Mutex, OwnedSemaphorePermit, Semaphore};

use crate::row::EventRow;

/// Row handoff queue length. Row memory is accounted by the batch permits
/// (a batch's permit outlives its queued rows), so this only tunes batching.
const ROW_QUEUE: usize = 1024;

/// Process-global budgets. A long-running worker runs several windows at
/// once; if each window built its own pools, every budget would silently
/// multiply by the slot count (measured: 801 MiB RSS from 4 × 256 MiB).
struct Pools {
    memory: Arc<Semaphore>,
    connections: Arc<Semaphore>,
    cpu: Arc<Semaphore>,
}

impl Pools {
    fn new(cfg: &Config) -> Arc<Self> {
        Arc::new(Self {
            memory: Arc::new(Semaphore::new(cfg.memory_budget_mb * 1024)),
            connections: Arc::new(Semaphore::new(cfg.net_concurrency)),
            cpu: Arc::new(Semaphore::new(cfg.cpu_concurrency)),
        })
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse()?;
    let cfg = Arc::new(Config::from_env()?);
    let store = s3_store(&cfg)?;
    let clickhouse = clickhouse_client(&cfg);

    // one LIST for the whole run, grouped by window
    let t_list = Instant::now();
    let mut files_by_window = list_grouped(&store, &args.prefix, &args.windows).await?;
    let list_ms = ms(t_list);

    // staging-slot pool: at most `slots` windows in flight, each owning one
    // staging table; the MOVE commit is single-writer across all of them
    let pools = Pools::new(&cfg);
    let slot_permits = Arc::new(Semaphore::new(cfg.slots));
    let free_slots = Arc::new(std::sync::Mutex::new(
        (0..cfg.slots).rev().collect::<Vec<_>>(),
    ));
    let move_lock = Arc::new(Mutex::new(()));
    let deadline = Duration::from_secs(cfg.batch_timeout_s);

    let mut handles = Vec::new();
    for window in &args.windows {
        let window = window.clone();
        let files = files_by_window.remove(&window).unwrap_or_default();
        let (cfg, store, clickhouse, pools, slot_permits, free_slots, move_lock) = (
            cfg.clone(),
            store.clone(),
            clickhouse.clone(),
            pools.clone(),
            slot_permits.clone(),
            free_slots.clone(),
            move_lock.clone(),
        );
        handles.push(tokio::spawn(async move {
            let permit = slot_permits
                .acquire_owned()
                .await
                .expect("semaphore never closed");
            let slot = free_slots.lock().unwrap().pop().expect("slot under permit");
            let result = tokio::time::timeout(
                deadline,
                commit_window(
                    &cfg,
                    store,
                    &clickhouse,
                    &pools,
                    slot,
                    &window,
                    files,
                    &move_lock,
                ),
            )
            .await
            .with_context(|| format!("{window}: deadline ({}s) exceeded", cfg.batch_timeout_s));
            free_slots.lock().unwrap().push(slot);
            drop(permit);
            result?
        }));
    }

    let (mut get_ms_sum, mut transform_ms_sum) = (0f64, 0f64);
    for handle in handles {
        let (get_ms, transform_ms) = handle.await??;
        get_ms_sum += get_ms;
        transform_ms_sum += transform_ms;
    }

    let (cpu_user_s, cpu_sys_s, max_rss_bytes) = rusage();
    print_line(&serde_json::json!({
        "summary": true,
        "windows": args.windows.len(),
        "list_ms": list_ms,
        "get_ms_sum": get_ms_sum,
        "transform_ms_sum": transform_ms_sum,
        "cpu_user_s": cpu_user_s,
        "cpu_sys_s": cpu_sys_s,
        "max_rss_bytes": max_rss_bytes,
    }));
    Ok(())
}

/// The full per-window commit protocol. Returns (get_ms_sum, transform_ms_sum)
/// for the run summary; the per-window stat line is printed here, as soon as
/// the window commits.
#[allow(clippy::too_many_arguments)]
async fn commit_window(
    cfg: &Config,
    store: Arc<dyn ObjectStore>,
    clickhouse: &clickhouse::Client,
    pools: &Arc<Pools>,
    slot: usize,
    window: &str,
    files: Vec<(ObjPath, u64)>,
    move_lock: &Mutex<()>,
) -> Result<(f64, f64)> {
    let staging = format!("events_poc_staging_{slot}");
    let t0 = Instant::now();

    clickhouse
        .query(&format!("TRUNCATE TABLE poc_chlb.{staging}"))
        .execute()
        .await
        .context("truncate staging")?;

    let t_fill = Instant::now();
    let outcome = run_batch(cfg, pools, store, clickhouse, &staging, files).await?;
    let insert_ms = ms(t_fill);

    let count = clickhouse
        .query(&format!(
            "SELECT toUInt64(count()) AS rows FROM poc_chlb.{staging}"
        ))
        .fetch_one::<CountRow>()
        .await
        .context("counting staging")?;
    anyhow::ensure!(
        count.rows == outcome.totals.rows,
        "{window}: staged {} rows but wrote {}",
        count.rows,
        outcome.totals.rows
    );

    let partitions: Vec<PartitionRow> = clickhouse
        .query(&format!(
            "SELECT partition_id FROM system.parts \
             WHERE database = 'poc_chlb' AND table = '{staging}' AND active \
             GROUP BY partition_id"
        ))
        .fetch_all()
        .await
        .context("listing staging partitions")?;

    let t_move = Instant::now();
    {
        // single-writer commit: concurrent MOVE PARTITION into one target
        // races server-side on 25.12 (LOGICAL_ERROR "Temporary part
        // tmp_move_from_... already added"); moves are milliseconds
        let _commit = move_lock.lock().await;
        for p in &partitions {
            clickhouse
                .query(&format!(
                    "ALTER TABLE poc_chlb.{staging} MOVE PARTITION ID '{}' \
                     TO TABLE poc_chlb.events_poc",
                    p.partition_id
                ))
                .execute()
                .await
                .context("moving partition")?;
        }
    }
    let move_ms = ms(t_move);

    let totals = &outcome.totals;
    print_line(&serde_json::json!({
        "window": window,
        "slot": slot,
        "rows": count.rows,
        "partitions": partitions.len(),
        "insert_ms": insert_ms,
        "move_ms": move_ms,
        "total_ms": ms(t0),
        "bytes_in": totals.bytes_in,
        "get_ms_sum": totals.get_ms,
        "transform_ms_sum": totals.transform_ms,
        "write_ms_sum": totals.write_ms,
        "insert_end_ms": outcome.insert_end_ms,
    }));
    Ok((totals.get_ms, totals.transform_ms))
}

#[derive(clickhouse::Row, Deserialize)]
struct CountRow {
    rows: u64,
}

#[derive(clickhouse::Row, Deserialize)]
struct PartitionRow {
    partition_id: String,
}

fn print_line(value: &serde_json::Value) {
    use std::io::Write as _;
    // stdout is block-buffered when piped; the harness streams these lines
    let mut out = std::io::stdout().lock();
    writeln!(out, "{value}").expect("stdout");
    out.flush().expect("stdout");
}

struct BatchOutcome {
    totals: Totals,
    insert_end_ms: f64,
}

async fn run_batch(
    cfg: &Config,
    pools: &Arc<Pools>,
    store: Arc<dyn ObjectStore>,
    clickhouse: &clickhouse::Client,
    staging: &str,
    files: Vec<(ObjPath, u64)>,
) -> Result<BatchOutcome> {
    let expected = files.len() as u64;
    let fetched = spawn_downloads(store, files, cfg, pools);
    let mut rows = spawn_transforms(fetched, cfg, pools);

    let mut insert = clickhouse.insert::<EventRow>(staging)?;
    let mut totals = Totals::default();
    while let Some(msg) = rows.recv().await {
        match msg {
            RowMsg::Row(row) => {
                let t_write = Instant::now();
                insert.write(&row).await?;
                totals.rows += 1;
                totals.write_ms += ms(t_write);
            }
            // arrives after the batch's last row (FIFO per sender): dropping
            // the permit here keeps the byte budget exact through write-out
            RowMsg::BatchDone(batch) => totals.add_batch(&batch),
            RowMsg::Fail(e) => return Err(e),
        }
    }
    // a panicked transform drops its channel slot silently — refuse to
    // finalize a batch we know is incomplete
    anyhow::ensure!(
        totals.batches == expected,
        "processed {} of {expected} objects",
        totals.batches
    );
    let t_end = Instant::now();
    insert.end().await.context("finalizing INSERT")?;

    Ok(BatchOutcome {
        totals,
        insert_end_ms: ms(t_end),
    })
}

/// `rust-worker <s3_prefix> <window_id>...`
struct Args {
    prefix: String,
    windows: Vec<String>,
}

impl Args {
    fn parse() -> Result<Self> {
        let mut args = std::env::args().skip(1);
        let prefix = args.next();
        let windows: Vec<String> = args.collect();
        match prefix {
            Some(prefix) if !windows.is_empty() => Ok(Self { prefix, windows }),
            _ => anyhow::bail!("usage: rust-worker <s3_prefix> <window_id>..."),
        }
    }
}

/// Endpoints and knobs, from the same POC_* env vars the Node scripts use.
struct Config {
    minio_endpoint: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    ch_url: String,
    ch_user: String,
    ch_password: String,
    net_concurrency: usize,
    cpu_concurrency: usize,
    prefetch: usize,
    memory_budget_mb: usize,
    batch_timeout_s: u64,
    slots: usize,
}

impl Config {
    fn from_env() -> Result<Self> {
        let cores = std::thread::available_parallelism().map_or(8, |n| n.get());
        Ok(Self {
            minio_endpoint: env_or("POC_MINIO_ENDPOINT", "http://127.0.0.1:9090"),
            bucket: env_or("POC_MINIO_BUCKET", "langfuse"),
            access_key: env_or("POC_MINIO_ACCESS_KEY", "minio"),
            secret_key: env_or("POC_MINIO_SECRET_KEY", "miniosecret"),
            ch_url: env_or("POC_CH_URL", "http://127.0.0.1:8123"),
            ch_user: env_or("POC_CH_USER", "clickhouse"),
            ch_password: env_or("POC_CH_PASSWORD", "clickhouse"),
            net_concurrency: env_or("POC_RW_NET_CONCURRENCY", "16")
                .parse()
                .context("POC_RW_NET_CONCURRENCY")?,
            cpu_concurrency: env_or("POC_RW_CPU_CONCURRENCY", &cores.to_string())
                .parse()
                .context("POC_RW_CPU_CONCURRENCY")?,
            prefetch: env_or("POC_RW_PREFETCH", "16")
                .parse()
                .context("POC_RW_PREFETCH")?,
            memory_budget_mb: env_or("POC_RW_MEMORY_BUDGET_MB", "256")
                .parse()
                .context("POC_RW_MEMORY_BUDGET_MB")?,
            batch_timeout_s: env_or("POC_RW_BATCH_TIMEOUT_S", "300")
                .parse()
                .context("POC_RW_BATCH_TIMEOUT_S")?,
            slots: env_or("POC_RW_SLOTS", "4")
                .parse()
                .context("POC_RW_SLOTS")?,
        })
    }
}

fn s3_store(cfg: &Config) -> Result<Arc<dyn ObjectStore>> {
    let store = AmazonS3Builder::new()
        .with_endpoint(cfg.minio_endpoint.as_str())
        .with_allow_http(true)
        .with_bucket_name(cfg.bucket.as_str())
        .with_access_key_id(cfg.access_key.as_str())
        .with_secret_access_key(cfg.secret_key.as_str())
        .with_region("us-east-1")
        .with_virtual_hosted_style_request(false)
        .build()?;
    Ok(Arc::new(store))
}

fn clickhouse_client(cfg: &Config) -> clickhouse::Client {
    clickhouse::Client::default()
        .with_url(cfg.ch_url.as_str())
        .with_user(cfg.ch_user.as_str())
        .with_password(cfg.ch_password.as_str())
        .with_database("poc_chlb")
        .with_option("log_comment", "poc-chlb-rust-insert")
}

/// One LIST over the corpus prefix, grouped by requested window. In the real
/// system the Redis ledger hands the worker exact keys; sizes feed the
/// memory budget before any GET.
async fn list_grouped(
    store: &Arc<dyn ObjectStore>,
    prefix: &str,
    windows: &[String],
) -> Result<HashMap<String, Vec<(ObjPath, u64)>>> {
    let wanted: HashSet<&str> = windows.iter().map(String::as_str).collect();
    let mut grouped: HashMap<String, Vec<(ObjPath, u64)>> = HashMap::new();
    let mut listing = store.list(Some(&ObjPath::from(prefix)));
    while let Some(meta) = listing.try_next().await.context("listing corpus")? {
        let window = meta
            .location
            .as_ref()
            .split('/')
            .find(|segment| wanted.contains(segment));
        if let Some(window) = window {
            grouped
                .entry(window.to_owned())
                .or_default()
                .push((meta.location, meta.size));
        }
    }
    Ok(grouped)
}

/// One raw object as fetched from S3, waiting in the prefetch queue. The
/// memory permit is sized to the object and travels until the writer has
/// written the batch's last row.
struct Fetched {
    key: ObjPath,
    bytes: bytes::Bytes,
    get_ms: f64,
    _mem: OwnedSemaphorePermit,
}

/// The download pool: one independent task per object (spawned tasks keep
/// making progress while CPU workers are busy — chained stream combinators
/// would not), gated by two separate budgets: connection count and bytes
/// held. Permits are acquired memory-first everywhere, so the gates cannot
/// deadlock; a full prefetch channel or an exhausted byte budget — never a
/// busy CPU — is what pauses fetching.
fn spawn_downloads(
    store: Arc<dyn ObjectStore>,
    files: Vec<(ObjPath, u64)>,
    cfg: &Config,
    pools: &Arc<Pools>,
) -> mpsc::Receiver<Result<Fetched>> {
    let (tx, rx) = mpsc::channel(cfg.prefetch);
    let budget_kib = cfg.memory_budget_mb * 1024;
    let memory = pools.memory.clone();
    let connections = pools.connections.clone();
    for (key, size) in files {
        let (store, memory, connections, tx) = (
            store.clone(),
            memory.clone(),
            connections.clone(),
            tx.clone(),
        );
        tokio::spawn(async move {
            let kib = usize::try_from(size.div_ceil(1024))
                .unwrap_or(usize::MAX)
                .max(1);
            if kib > budget_kib {
                let oversized = anyhow::anyhow!(
                    "{key} is {size} bytes — larger than POC_RW_MEMORY_BUDGET_MB \
                     ({} MiB); raise the budget or split the file",
                    budget_kib / 1024
                );
                let _ = tx.send(Err(oversized)).await;
                return;
            }
            let mem = memory
                .acquire_many_owned(kib as u32)
                .await
                .expect("semaphore never closed");
            let result = {
                let _conn = connections
                    .acquire_owned()
                    .await
                    .expect("semaphore never closed");
                download(&store, &key).await
                // connection slot freed here; the bytes stay accounted
            };
            let _ = tx // receiver gone = run aborted; just exit
                .send(result.map(|(bytes, get_ms)| Fetched {
                    key,
                    bytes,
                    get_ms,
                    _mem: mem,
                }))
                .await;
        });
    }
    rx
}

async fn download(store: &Arc<dyn ObjectStore>, key: &ObjPath) -> Result<(bytes::Bytes, f64)> {
    let t_get = Instant::now();
    let bytes = store
        .get(key)
        .await
        .with_context(|| format!("GET {key}"))?
        .bytes()
        .await?;
    Ok((bytes, ms(t_get)))
}

/// One message stream from the CPU pool to the writer. FIFO per batch:
/// BatchDone follows that batch's last Row, so the writer drops the memory
/// permit only once everything the batch produced has been written.
// Rows travel unboxed: A/B-measured identical CPU vs Box<EventRow> (one
// alloc among the row's ~35 string allocs is noise), and unboxed skips it;
// the cost is slot width in the bounded channel, which is trivial.
#[allow(clippy::large_enum_variant)]
enum RowMsg {
    Row(EventRow),
    BatchDone(BatchDone),
    Fail(anyhow::Error),
}

struct BatchDone {
    bytes: u64,
    get_ms: f64,
    transform_ms: f64,
    _mem: OwnedSemaphorePermit,
}

/// CPU stage: pulls fetched objects, transforms each on the blocking pool at
/// `cpu_concurrency` width, and streams rows out the moment the parser
/// produces them — no per-batch row set exists anywhere.
fn spawn_transforms(
    mut fetched: mpsc::Receiver<Result<Fetched>>,
    cfg: &Config,
    pools: &Arc<Pools>,
) -> mpsc::Receiver<RowMsg> {
    let (tx, rx) = mpsc::channel(ROW_QUEUE);
    let cpu = pools.cpu.clone();
    let bucket = cfg.bucket.clone();
    tokio::spawn(async move {
        while let Some(next) = fetched.recv().await {
            let batch = match next {
                Ok(batch) => batch,
                Err(e) => {
                    let _ = tx.send(RowMsg::Fail(e)).await;
                    return;
                }
            };
            let permit = cpu
                .clone()
                .acquire_owned()
                .await
                .expect("semaphore never closed");
            let (tx, bucket) = (tx.clone(), bucket.clone());
            tokio::task::spawn_blocking(move || {
                let _cpu = permit;
                let t_transform = Instant::now();
                let key = batch.key.as_ref();
                let blob_path = format!("{bucket}/{key}");
                let result = transform::transform_batch(
                    project_from_key(key),
                    &blob_path,
                    &batch.bytes,
                    // writer gone = run aborted; ignore send failures, finish out
                    &mut |row| {
                        let _ = tx.blocking_send(RowMsg::Row(row));
                    },
                )
                .with_context(|| format!("transform {}", batch.key));
                let msg = match result {
                    Ok(()) => RowMsg::BatchDone(BatchDone {
                        bytes: batch.bytes.len() as u64,
                        get_ms: batch.get_ms,
                        transform_ms: ms(t_transform),
                        _mem: batch._mem,
                    }),
                    Err(e) => RowMsg::Fail(e),
                };
                let _ = tx.blocking_send(msg);
            });
        }
    });
    rx
}

#[derive(Default)]
struct Totals {
    batches: u64,
    rows: u64,
    bytes_in: u64,
    get_ms: f64,
    transform_ms: f64,
    write_ms: f64,
}

impl Totals {
    fn add_batch(&mut self, batch: &BatchDone) {
        self.batches += 1;
        self.bytes_in += batch.bytes;
        self.get_ms += batch.get_ms;
        self.transform_ms += batch.transform_ms;
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn ms(since: Instant) -> f64 {
    since.elapsed().as_secs_f64() * 1e3
}

/// Same extraction as Path A's `extract(_path, 'otel-poc[^/]*/([^/]+)/')`.
fn project_from_key(key: &str) -> &str {
    let mut segments = key.split('/');
    while let Some(s) = segments.next() {
        if s.starts_with("otel-poc") {
            return segments.next().unwrap_or("");
        }
    }
    ""
}

fn rusage() -> (f64, f64, u64) {
    // SAFETY: plain libc call filling a zeroed out-param
    unsafe {
        let mut ru: libc::rusage = std::mem::zeroed();
        libc::getrusage(libc::RUSAGE_SELF, &mut ru);
        let secs = |tv: libc::timeval| tv.tv_sec as f64 + tv.tv_usec as f64 / 1e6;
        // ru_maxrss is bytes on macOS, kilobytes on Linux
        let unit = if cfg!(target_os = "macos") { 1 } else { 1024 };
        (
            secs(ru.ru_utime),
            secs(ru.ru_stime),
            ru.ru_maxrss as u64 * unit,
        )
    }
}
