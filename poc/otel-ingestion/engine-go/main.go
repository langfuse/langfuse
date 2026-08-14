// Path B spike in Go: a long-running worker that processes ALL windows of a
// run in one process and owns the commit protocol end to end — TRUNCATE
// staging, GET raw objects, transform natively, stream one columnar INSERT
// per window, row-count check, MOVE PARTITION (single-writer). Deliberately
// the same shape as engine-rust/src/main.rs, so the two spikes differ only
// in language and runtime, not architecture.
//
// Everything streams: downloads run as independent goroutines feeding a
// bounded prefetch channel; CPU workers parse each batch as a sequence and
// hand rows to the writer the moment they exist; the writer feeds one
// long-lived INSERT per window (ch-go OnInput), flushing eagerly — the
// server squashes chunks into min_insert_block_size blocks, so part size
// never depends on client chunking.
//
// Budgets (process-global, POC_GW_*): NET_CONCURRENCY caps connections,
// MEMORY_BUDGET_MB caps bytes held between GET start and the batch's last
// row being written, CPU_CONCURRENCY caps parallel transforms, SLOTS is the
// staging-table pool; each window runs under BATCH_TIMEOUT_S.
//
// Usage: go-worker <s3_prefix> <window_id>...
// Prints one JSON line per window as it commits, then {"summary": ...}.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"runtime/pprof"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/ClickHouse/ch-go"
	"github.com/ClickHouse/ch-go/chpool"
	"github.com/ClickHouse/ch-go/proto"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"golang.org/x/sync/errgroup"
	"golang.org/x/sync/semaphore"
)

// Row handoff queue length. Row memory is accounted by the batch permits (a
// batch's permit outlives its queued rows), so this only tunes batching.
const rowQueue = 1024

// Eager-flush bounds for one INSERT block: cut on whichever comes first. The
// writer drains whatever is immediately available and ships it, so blocks
// are usually smaller; these only bound the worst case.
const (
	maxBlockRows  = 8192
	maxBlockBytes = 8 << 20
)

type config struct {
	minioEndpoint  string
	bucket         string
	accessKey      string
	secretKey      string
	chAddr         string
	chUser         string
	chPassword     string
	netConcurrency int
	cpuConcurrency int
	prefetch       int
	memoryBudgetMB int
	batchTimeoutS  int
	slots          int
}

func loadConfig() (*config, error) {
	cfg := &config{
		minioEndpoint: envOr("POC_MINIO_ENDPOINT", "http://127.0.0.1:9090"),
		bucket:        envOr("POC_MINIO_BUCKET", "langfuse"),
		accessKey:     envOr("POC_MINIO_ACCESS_KEY", "minio"),
		secretKey:     envOr("POC_MINIO_SECRET_KEY", "miniosecret"),
		chAddr:        envOr("POC_CH_NATIVE_ADDR", "127.0.0.1:9000"),
		chUser:        envOr("POC_CH_USER", "clickhouse"),
		chPassword:    envOr("POC_CH_PASSWORD", "clickhouse"),
	}
	for _, v := range []struct {
		dst      *int
		key      string
		fallback int
	}{
		{&cfg.netConcurrency, "POC_GW_NET_CONCURRENCY", 16},
		{&cfg.cpuConcurrency, "POC_GW_CPU_CONCURRENCY", runtime.NumCPU()},
		{&cfg.prefetch, "POC_GW_PREFETCH", 16},
		{&cfg.memoryBudgetMB, "POC_GW_MEMORY_BUDGET_MB", 256},
		{&cfg.batchTimeoutS, "POC_GW_BATCH_TIMEOUT_S", 300},
		{&cfg.slots, "POC_GW_SLOTS", 4},
	} {
		n, err := strconv.Atoi(envOr(v.key, strconv.Itoa(v.fallback)))
		if err != nil {
			return nil, fmt.Errorf("%s: %w", v.key, err)
		}
		*v.dst = n
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Process-global budgets. A long-running worker runs several windows at
// once; per-window pools would silently multiply every budget by the slot
// count (the Rust worker measured 801 MiB RSS from 4 x 256 MiB).
type pools struct {
	memory *semaphore.Weighted // bytes held between GET start and write-out
	conns  chan struct{}
	cpu    chan struct{}
}

type app struct {
	cfg   *config
	mc    *minio.Client
	ch    *chpool.Pool
	pools *pools

	moveMu  sync.Mutex // single-writer MOVE PARTITION commit
	printMu sync.Mutex
}

var chSettings = []ch.Setting{{Key: "log_comment", Value: "poc-chlb-go-insert", Important: true}}

func main() {
	stopProfile := func() {}
	if path := os.Getenv("POC_GW_CPUPROFILE"); path != "" {
		f, err := os.Create(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := pprof.StartCPUProfile(f); err == nil {
			stopProfile = pprof.StopCPUProfile
		}
	}
	err := run()
	stopProfile() // os.Exit skips defers; stop explicitly
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) < 3 {
		return errors.New("usage: go-worker <s3_prefix> <window_id>...")
	}
	prefix, windows := os.Args[1], os.Args[2:]

	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	ctx := context.Background()

	endpoint := strings.TrimPrefix(strings.TrimPrefix(cfg.minioEndpoint, "http://"), "https://")
	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.accessKey, cfg.secretKey, ""),
		Secure: strings.HasPrefix(cfg.minioEndpoint, "https://"),
	})
	if err != nil {
		return fmt.Errorf("minio client: %w", err)
	}

	pool, err := chpool.Dial(ctx, chpool.Options{
		ClientOptions: ch.Options{
			Address:     cfg.chAddr,
			User:        cfg.chUser,
			Password:    cfg.chPassword,
			Database:    "poc_chlb",
			Compression: ch.CompressionLZ4,
			ReadTimeout: ch.NoTimeout, // the per-window deadline governs
		},
		MaxConns: int32(cfg.slots*2 + 2),
	})
	if err != nil {
		return fmt.Errorf("clickhouse pool: %w", err)
	}
	defer pool.Close()

	a := &app{
		cfg: cfg,
		mc:  mc,
		ch:  pool,
		pools: &pools{
			memory: semaphore.NewWeighted(int64(cfg.memoryBudgetMB) << 20),
			conns:  make(chan struct{}, cfg.netConcurrency),
			cpu:    make(chan struct{}, cfg.cpuConcurrency),
		},
	}

	// one LIST for the whole run, grouped by window; sizes feed the memory
	// budget before any GET (in the real system the Redis ledger hands the
	// worker exact keys)
	tList := time.Now()
	grouped, err := listGrouped(ctx, a, prefix, windows)
	if err != nil {
		return err
	}
	listMs := msSince(tList)

	// staging-slot pool: at most `slots` windows in flight, each owning one
	// staging table; the MOVE commit is single-writer across all of them
	slotCh := make(chan int, cfg.slots)
	for s := 0; s < cfg.slots; s++ {
		slotCh <- s
	}

	var sumMu sync.Mutex
	var getMsSum, transformMsSum float64
	g, gctx := errgroup.WithContext(ctx)
	for _, window := range windows {
		window := window
		files := grouped[window]
		g.Go(func() error {
			var slot int
			select {
			case slot = <-slotCh:
			case <-gctx.Done():
				return gctx.Err()
			}
			defer func() { slotCh <- slot }()

			wctx, cancel := context.WithTimeout(gctx, time.Duration(cfg.batchTimeoutS)*time.Second)
			defer cancel()
			getMs, transformMs, err := commitWindow(wctx, a, slot, window, files)
			if err != nil {
				if errors.Is(err, context.DeadlineExceeded) {
					return fmt.Errorf("%s: deadline (%ds) exceeded", window, cfg.batchTimeoutS)
				}
				return fmt.Errorf("%s: %w", window, err)
			}
			sumMu.Lock()
			getMsSum += getMs
			transformMsSum += transformMs
			sumMu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return err
	}

	userS, sysS, maxRSS := rusage()
	a.printLine(map[string]any{
		"summary":          true,
		"windows":          len(windows),
		"list_ms":          listMs,
		"get_ms_sum":       getMsSum,
		"transform_ms_sum": transformMsSum,
		"cpu_user_s":       userS,
		"cpu_sys_s":        sysS,
		"max_rss_bytes":    maxRSS,
	})
	return nil
}

type objMeta struct {
	key  string
	size int64
}

func listGrouped(ctx context.Context, a *app, prefix string, windows []string) (map[string][]objMeta, error) {
	wanted := make(map[string]bool, len(windows))
	for _, w := range windows {
		wanted[w] = true
	}
	grouped := make(map[string][]objMeta)
	for obj := range a.mc.ListObjects(ctx, a.cfg.bucket, minio.ListObjectsOptions{Prefix: prefix, Recursive: true}) {
		if obj.Err != nil {
			return nil, fmt.Errorf("listing corpus: %w", obj.Err)
		}
		for _, segment := range strings.Split(obj.Key, "/") {
			if wanted[segment] {
				grouped[segment] = append(grouped[segment], objMeta{key: obj.Key, size: obj.Size})
				break
			}
		}
	}
	return grouped, nil
}

// commitWindow is the full per-window commit protocol. Returns this window's
// (get_ms_sum, transform_ms_sum) for the run summary; the per-window stat
// line is printed here, as soon as the window commits.
func commitWindow(ctx context.Context, a *app, slot int, window string, files []objMeta) (float64, float64, error) {
	staging := fmt.Sprintf("events_poc_staging_%d", slot)
	t0 := time.Now()

	if err := a.do(ctx, fmt.Sprintf("TRUNCATE TABLE poc_chlb.%s", staging)); err != nil {
		return 0, 0, fmt.Errorf("truncate staging: %w", err)
	}

	tFill := time.Now()
	tot, insertEndMs, err := runBatch(ctx, a, staging, files)
	if err != nil {
		return 0, 0, err
	}
	insertMs := msSince(tFill)

	var cnt proto.ColUInt64
	if err := a.ch.Do(ctx, ch.Query{
		Body:     fmt.Sprintf("SELECT toUInt64(count()) AS rows FROM poc_chlb.%s", staging),
		Result:   proto.Results{{Name: "rows", Data: &cnt}},
		Settings: chSettings,
	}); err != nil {
		return 0, 0, fmt.Errorf("counting staging: %w", err)
	}
	if len(cnt) != 1 || cnt[0] != tot.rows {
		return 0, 0, fmt.Errorf("%s: staged %v rows but wrote %d", window, cnt, tot.rows)
	}

	var partitions proto.ColStr
	if err := a.ch.Do(ctx, ch.Query{
		Body: fmt.Sprintf("SELECT partition_id FROM system.parts"+
			" WHERE database = 'poc_chlb' AND table = '%s' AND active GROUP BY partition_id", staging),
		Result:   proto.Results{{Name: "partition_id", Data: &partitions}},
		Settings: chSettings,
	}); err != nil {
		return 0, 0, fmt.Errorf("listing staging partitions: %w", err)
	}

	tMove := time.Now()
	{
		// single-writer commit: concurrent MOVE PARTITION into one target
		// races server-side on 25.12 (LOGICAL_ERROR "Temporary part
		// tmp_move_from_... already added"); moves are milliseconds
		a.moveMu.Lock()
		for i := 0; i < partitions.Rows(); i++ {
			if err := a.do(ctx, fmt.Sprintf(
				"ALTER TABLE poc_chlb.%s MOVE PARTITION ID '%s' TO TABLE poc_chlb.events_poc",
				staging, partitions.Row(i),
			)); err != nil {
				a.moveMu.Unlock()
				return 0, 0, fmt.Errorf("moving partition: %w", err)
			}
		}
		a.moveMu.Unlock()
	}
	moveMs := msSince(tMove)

	a.printLine(map[string]any{
		"window":           window,
		"slot":             slot,
		"rows":             tot.rows,
		"partitions":       partitions.Rows(),
		"insert_ms":        insertMs,
		"move_ms":          moveMs,
		"total_ms":         msSince(t0),
		"bytes_in":         tot.bytesIn,
		"get_ms_sum":       tot.getMs,
		"transform_ms_sum": tot.transformMs,
		"write_ms_sum":     tot.writeMs,
		"insert_end_ms":    insertEndMs,
	})
	return tot.getMs, tot.transformMs, nil
}

func (a *app) do(ctx context.Context, body string) error {
	return a.ch.Do(ctx, ch.Query{Body: body, Settings: chSettings})
}

func (a *app) printLine(v any) {
	line, err := json.Marshal(v)
	if err != nil {
		panic(err) // stat structs always marshal
	}
	a.printMu.Lock()
	defer a.printMu.Unlock()
	os.Stdout.Write(append(line, '\n'))
}

type totals struct {
	batches     uint64
	rows        uint64
	bytesIn     uint64
	getMs       float64
	transformMs float64
	writeMs     float64
}

// One message stream from the CPU pool to the writer. FIFO per batch:
// the done message follows that batch's last row (channel sends preserve
// per-sender order), so the writer releases the memory permit only once
// everything the batch produced has been written.
type rowMsg struct {
	row  *eventRow
	done *batchDone
	err  error
}

type batchDone struct {
	bytes       uint64
	getMs       float64
	transformMs float64
	release     func()
}

// runBatch wires downloads -> transforms -> one streaming INSERT and pumps
// it via OnInput: each fill grabs whatever rows are immediately available
// (eager flush), cutting a block at maxBlockRows/maxBlockBytes at most.
func runBatch(ctx context.Context, a *app, staging string, files []objMeta) (totals, float64, error) {
	fetched := spawnDownloads(ctx, a, files)
	rows := spawnTransforms(ctx, a, fetched)

	cols := newEventColumns()
	var tot totals
	var tEOF time.Time
	fill := func(fctx context.Context) error {
		cols.reset()
		n, blockBytes := 0, 0
		for n < maxBlockRows && blockBytes < maxBlockBytes {
			var m rowMsg
			var ok bool
			if n == 0 {
				select { // nothing buffered yet: wait for work
				case m, ok = <-rows:
				case <-fctx.Done():
					return fctx.Err()
				}
			} else {
				select { // rows in hand: ship them as soon as the queue idles
				case m, ok = <-rows:
				default:
					return nil
				}
			}
			if !ok {
				tEOF = time.Now()
				return io.EOF // ch-go flushes any tail rows before finishing
			}
			switch {
			case m.err != nil:
				return m.err
			case m.done != nil:
				// arrives after the batch's last row: releasing here keeps
				// the byte budget exact through write-out
				tot.batches++
				tot.bytesIn += m.done.bytes
				tot.getMs += m.done.getMs
				tot.transformMs += m.done.transformMs
				m.done.release()
			default:
				t := time.Now()
				cols.appendRow(m.row)
				blockBytes += len(m.row.input) + len(m.row.output)
				tot.rows++
				tot.writeMs += msSince(t)
				n++
			}
		}
		return nil
	}

	if err := a.ch.Do(ctx, ch.Query{
		Body:     cols.in.Into(staging),
		Input:    cols.in,
		OnInput:  fill,
		Settings: chSettings,
	}); err != nil {
		return tot, 0, fmt.Errorf("streaming INSERT: %w", err)
	}
	// a paniced transform would crash the process outright, but a row sink
	// muted by cancellation must not pass for a complete batch
	if tot.batches != uint64(len(files)) {
		return tot, 0, fmt.Errorf("processed %d of %d objects", tot.batches, len(files))
	}
	return tot, msSince(tEOF), nil
}

type fetchMsg struct {
	f   fetched
	err error
}

// One raw object as fetched from S3, waiting in the prefetch queue. The
// memory reservation is sized to the object and travels (as release) until
// the writer has consumed the batch's done message.
type fetched struct {
	key     string
	size    int64
	data    []byte
	getMs   float64
	release func()
}

// spawnDownloads runs one independent goroutine per object (they keep making
// progress while CPU workers are busy), gated by two separate budgets:
// connection count and bytes held. Reservations are taken memory-first
// everywhere, so the gates cannot deadlock; a full prefetch channel or an
// exhausted byte budget — never a busy CPU — is what pauses fetching.
func spawnDownloads(ctx context.Context, a *app, files []objMeta) <-chan fetchMsg {
	out := make(chan fetchMsg, a.cfg.prefetch)
	budget := int64(a.cfg.memoryBudgetMB) << 20
	var wg sync.WaitGroup
	for _, f := range files {
		wg.Add(1)
		go func(f objMeta) {
			defer wg.Done()
			if f.size > budget {
				sendFetch(ctx, out, fetchMsg{err: fmt.Errorf(
					"%s is %d bytes — larger than POC_GW_MEMORY_BUDGET_MB (%d MiB); raise the budget or split the file",
					f.key, f.size, a.cfg.memoryBudgetMB)})
				return
			}
			if err := a.pools.memory.Acquire(ctx, f.size); err != nil {
				return // run aborted while queued
			}
			release := sync.OnceFunc(func() { a.pools.memory.Release(f.size) })
			data, getMs, err := download(ctx, a, f)
			if err != nil {
				release()
				sendFetch(ctx, out, fetchMsg{err: fmt.Errorf("GET %s: %w", f.key, err)})
				return
			}
			if !sendFetch(ctx, out, fetchMsg{f: fetched{key: f.key, size: f.size, data: data, getMs: getMs, release: release}}) {
				release() // run aborted; nobody will consume this batch
			}
		}(f)
	}
	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}

func download(ctx context.Context, a *app, f objMeta) ([]byte, float64, error) {
	select {
	case a.pools.conns <- struct{}{}:
	case <-ctx.Done():
		return nil, 0, ctx.Err()
	}
	defer func() { <-a.pools.conns }() // connection freed here; bytes stay accounted
	t := time.Now()
	obj, err := a.mc.GetObject(ctx, a.cfg.bucket, f.key, minio.GetObjectOptions{})
	if err != nil {
		return nil, 0, err
	}
	defer obj.Close()
	data := make([]byte, f.size)
	if _, err := io.ReadFull(obj, data); err != nil {
		return nil, 0, err
	}
	return data, msSince(t), nil
}

// spawnTransforms pulls fetched objects, parses each on a CPU-pool goroutine
// and streams rows out the moment the parser produces them — no per-batch
// row set exists anywhere.
func spawnTransforms(ctx context.Context, a *app, in <-chan fetchMsg) <-chan rowMsg {
	out := make(chan rowMsg, rowQueue)
	go func() {
		var wg sync.WaitGroup
		defer close(out)
		defer wg.Wait()
		for fm := range in {
			if fm.err != nil {
				sendRow(ctx, out, rowMsg{err: fm.err})
				return
			}
			f := fm.f
			select {
			case a.pools.cpu <- struct{}{}:
			case <-ctx.Done():
				f.release()
				continue // keep draining so every reservation is returned
			}
			wg.Add(1)
			go func(f fetched) {
				defer wg.Done()
				defer func() { <-a.pools.cpu }()
				t := time.Now()
				blobPath := a.cfg.bucket + "/" + f.key
				err := transformBatch(projectFromKey(f.key), blobPath, f.data, func(r *eventRow) {
					// writer gone = run aborted; drop rows, finish out
					sendRow(ctx, out, rowMsg{row: r})
				})
				f.data = nil
				if err != nil {
					f.release()
					sendRow(ctx, out, rowMsg{err: fmt.Errorf("transform %s: %w", f.key, err)})
					return
				}
				done := &batchDone{bytes: uint64(f.size), getMs: f.getMs, transformMs: msSince(t), release: f.release}
				if !sendRow(ctx, out, rowMsg{done: done}) {
					f.release()
				}
			}(f)
		}
	}()
	return out
}

func sendFetch(ctx context.Context, ch chan<- fetchMsg, m fetchMsg) bool {
	select {
	case ch <- m:
		return true
	case <-ctx.Done():
		return false
	}
}

func sendRow(ctx context.Context, ch chan<- rowMsg, m rowMsg) bool {
	select {
	case ch <- m:
		return true
	case <-ctx.Done():
		return false
	}
}

func msSince(t time.Time) float64 {
	return float64(time.Since(t)) / 1e6
}

func rusage() (userS, sysS float64, maxRSSBytes uint64) {
	var ru syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &ru); err != nil {
		return 0, 0, 0
	}
	secs := func(sec int64, usec int64) float64 { return float64(sec) + float64(usec)/1e6 }
	unit := uint64(1024) // ru_maxrss is kilobytes on Linux...
	if runtime.GOOS == "darwin" {
		unit = 1 // ...and bytes on macOS
	}
	return secs(int64(ru.Utime.Sec), int64(ru.Utime.Usec)),
		secs(int64(ru.Stime.Sec), int64(ru.Stime.Usec)),
		uint64(ru.Maxrss) * unit
}
