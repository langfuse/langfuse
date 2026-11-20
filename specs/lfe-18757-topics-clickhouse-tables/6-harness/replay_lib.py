# Runs SQL against the local ClickHouse container with fixed limits (8 threads, 6 GB per query) and caches disabled, tagging each query so its cost can be read from system.query_log.
import subprocess
CH = ["docker", "exec", "-i", "langfuse-clickhouse", "clickhouse-client", "--user", "clickhouse", "--password", "clickhouse",
      "--use_query_condition_cache", "0", "--use_uncompressed_cache", "0", "--max_memory_usage", "6000000000", "--max_threads", "8"]
def ch(sql, params=None, tag=None, fmt="Null"):
    args = list(CH)
    if tag: args += ["--log_comment", tag]
    for k, v in (params or {}).items(): args.append(f"--param_{k}={v}")
    r = subprocess.run(args + ["-q", sql + (f" FORMAT {fmt}" if fmt else "")], capture_output=True, text=True)
    if r.returncode: return "ERR " + (r.stderr.strip().splitlines() or ["?"])[0][:300]
    return r.stdout
def arr(xs): return "[" + ",".join("'" + x.replace("'", "\\'") + "'" for x in xs) + "]"
def arr_dt(xs): return "[" + ",".join("'" + x + "'" for x in xs) + "]"
common = dict(internalEnvironmentPrefix="langfuse", publicLlmJudgeEnvironment="llm-as-a-judge")
