#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "langfuse>=4.7,<5",
# ]
# ///
#
# Vendored copy of hooks/langfuse_hook.py from
# https://github.com/langfuse/Claude-Observability-Plugin (MIT) at commit
# 169ddfac42a6836f0017f1f8ff1396ff6c67e12f. Do not edit here; re-download at a newer
# commit and update this pointer. The dependabot-security-maintainer workflow
# runs it once per run as a post-step over the archived Claude Code transcript.
#
"""
Claude Code -> Langfuse hook

"""

import base64
import contextlib
import json
import logging
import os
import random
import sys
import threading
import time
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ----------------- Configuration -----------------
def _opt(name: str) -> str:
    """Read a config value: plain env var first, plugin userConfig (CLAUDE_PLUGIN_OPTION_<NAME>) as fallback.

    Claude Code stores plugin userConfig at machine scope only, while `env` blocks
    are per-repo — so the repo-level env var must win, wizard as fallback.
    """
    return os.environ.get(name) or os.environ.get(f"CLAUDE_PLUGIN_OPTION_{name}") or ""

DEBUG = _opt("CC_LANGFUSE_DEBUG").lower() == "true"
SKILL_TAGS = (_opt("CC_LANGFUSE_SKILL_TAGS") or "true").lower() == "true"
CAPTURE_SKILL_CONTENT = _opt("CC_LANGFUSE_CAPTURE_SKILL_CONTENT").lower() == "true"
CAPTURE_IMAGES = (_opt("CC_LANGFUSE_CAPTURE_IMAGES") or "true").lower() == "true"
try:
    MAX_CHARS = int(_opt("CC_LANGFUSE_MAX_CHARS") or "20000")
except ValueError:
    MAX_CHARS = 20000

# Bound for unresolved task notifications kept in the state file between runs.
MAX_PENDING_TASK_NOTIFICATIONS = 50


# ----------------- Paths -----------------
def _resolve_state_dir() -> Tuple[Path, str]:
    """Resolve the state directory, taking CC_LANGFUSE_STATE_DIR into account.

    Multi-installation setups (CLAUDE_CONFIG_DIR) point each installation at
    its own directory so installations stop sharing one log, state file and
    lock. The historical default is ~/.claude/state, which is used when the 
    override is unset or invalid. 

    Returns (directory, warning). A non-empty warning means the override was
    rejected and the default is in use.
    """
    default = Path.home() / ".claude" / "state"
    override = _opt("CC_LANGFUSE_STATE_DIR")
    if not override:
        return default, ""
    try:
        # expanduser raises RuntimeError for '~unknownuser/...' paths
        candidate = Path(override).expanduser()
    except Exception as e:
        return default, (
            f"CC_LANGFUSE_STATE_DIR {override!r} is unusable ({type(e).__name__}: {e}); "
            f"falling back to {default}"
        )
    if not candidate.is_absolute():
        return default, (
            f"CC_LANGFUSE_STATE_DIR {override!r} is not an absolute path; "
            f"falling back to {default}"
        )
    try:
        candidate.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return default, (
            f"CC_LANGFUSE_STATE_DIR {override!r} is unusable ({type(e).__name__}: {e}); "
            f"falling back to {default}"
        )
    # mkdir(exist_ok=True) passes for a pre-existing dir the user cannot write
    # to (root-owned, read-only volume); accepting it would kill log, lock and
    # state at once — the one failure mode with no channel left to report itself.
    if not os.access(candidate, os.W_OK | os.X_OK):
        return default, (
            f"CC_LANGFUSE_STATE_DIR {override!r} is unusable (directory exists but is not writable); "
            f"falling back to {default}"
        )
    return candidate, ""

STATE_DIR, _STATE_DIR_WARNING = _resolve_state_dir()
LOG_FILE = STATE_DIR / "langfuse_hook.log"
STATE_FILE = STATE_DIR / "langfuse_state.json"
LOCK_FILE = STATE_DIR / "langfuse_state.lock"


@dataclass
class LangfuseConfig:
    public_key: str
    secret_key: str
    host: str
    user_id: Optional[str]
    trace_seed: Optional[str] = None
    parent_trace_id: Optional[str] = None
    parent_span_id: Optional[str] = None

    @property
    def parent_context(self) -> Optional[Tuple[str, str]]:
        """(trace_id, span_id) of an externally provided parent, if any."""
        if self.parent_trace_id and self.parent_span_id:
            return (self.parent_trace_id, self.parent_span_id)
        return None

def parse_traceparent(value: str) -> Optional[Tuple[str, str]]:
    """Parse a W3C traceparent string into (trace_id, span_id).

    Accepts the version-00 format `00-<32 hex trace id>-<16 hex span id>-<flags>`
    (https://www.w3.org/TR/trace-context/). All-zero ids are invalid per spec.
    The flags field is ignored (tolerant reader): the hook only needs the ids.
    """
    parts = value.strip().lower().split("-")
    if len(parts) != 4:
        return None
    version, trace_id, span_id, _flags = parts
    if version != "00":
        return None
    if not _is_valid_trace_id_hex(trace_id):
        return None
    if not is_valid_span_id_hex(span_id) or int(span_id, 16) == 0:
        return None
    return trace_id, span_id

def get_parent_trace_context_from_env() -> Tuple[Optional[str], Optional[str]]:
    """Read the opt-in parent trace context ("attached mode") from the env.

    CC_LANGFUSE_TRACEPARENT (W3C format) wins over the explicit id pair.
    Deliberately namespaced — bare TRACEPARENT is NOT read, because Claude
    Code's native OTel telemetry injects TRACEPARENT into subprocess
    environments and would silently reparent every trace.
    """
    traceparent = _opt("CC_LANGFUSE_TRACEPARENT")
    if traceparent:
        parsed = parse_traceparent(traceparent)
        if parsed is not None:
            return parsed
        info(f"Ignoring malformed CC_LANGFUSE_TRACEPARENT {traceparent!r}")
    parent_trace_id = _opt("CC_LANGFUSE_PARENT_TRACE_ID").strip().lower() or None
    parent_span_id = _opt("CC_LANGFUSE_PARENT_SPAN_ID").strip().lower() or None
    if parent_trace_id is None and parent_span_id is None:
        return None, None
    if (
        not _is_valid_trace_id_hex(parent_trace_id)
        or not is_valid_span_id_hex(parent_span_id)
        or int(parent_span_id, 16) == 0
    ):
        info(
            "Ignoring parent trace context: CC_LANGFUSE_PARENT_TRACE_ID and "
            "CC_LANGFUSE_PARENT_SPAN_ID must both be valid non-zero hex ids"
        )
        return None, None
    return parent_trace_id, parent_span_id

def _core_opt(name: str) -> Tuple[str, str]:
    """Resolve NAME/CC_NAME source-first — any env spelling beats any wizard
    spelling — returning (value, source) for mixed-source detection."""
    for source, key in (
        ("env", name),
        ("env", f"CC_{name}"),
        ("wizard", f"CLAUDE_PLUGIN_OPTION_{name}"),
        ("wizard", f"CLAUDE_PLUGIN_OPTION_CC_{name}"),
    ):
        value = os.environ.get(key)
        if value:
            return value, source
    return "", ""

def get_langfuse_config() -> Optional[LangfuseConfig]:
    public_key, public_key_source = _core_opt("LANGFUSE_PUBLIC_KEY")
    secret_key, secret_key_source = _core_opt("LANGFUSE_SECRET_KEY")
    host, host_source = _core_opt("LANGFUSE_BASE_URL")
    host = host or "https://cloud.langfuse.com"
    user_id = _core_opt("LANGFUSE_USER_ID")[0] or None
    trace_seed = _opt("CC_LANGFUSE_TRACE_SEED") or None
    parent_trace_id, parent_span_id = get_parent_trace_context_from_env()
    if parent_trace_id is not None and trace_seed is not None:
        # Both features pin the root's trace id; the externally provided
        # parent wins because it also carries the nesting intent.
        info("CC_LANGFUSE_TRACE_SEED ignored: parent trace context takes precedence")
        trace_seed = None

    if not public_key or not secret_key:
        return None

    # Export auth failures are swallowed downstream (capped background flush),
    # so this is the only place a torn key/host pair is still diagnosable.
    sources = {s for s in (public_key_source, secret_key_source, host_source) if s}
    if len(sources) > 1:
        info(
            "Langfuse config is mixed-source: public_key from "
            f"{public_key_source}, secret_key from {secret_key_source}, "
            f"base_url from {host_source or 'default'} — mismatched key/host "
            "pairs fail with 401 and traces are dropped."
        )

    return LangfuseConfig(
        public_key=public_key,
        secret_key=secret_key,
        host=host,
        user_id=user_id,
        trace_seed=trace_seed,
        parent_trace_id=parent_trace_id,
        parent_span_id=parent_span_id,
    )

def _missing_langfuse_keys() -> List[str]:
    missing = []
    if not _core_opt("LANGFUSE_PUBLIC_KEY")[0]:
        missing.append("LANGFUSE_PUBLIC_KEY")
    if not _core_opt("LANGFUSE_SECRET_KEY")[0]:
        missing.append("LANGFUSE_SECRET_KEY")
    return missing

def _plugin_load_identity() -> str:
    # CLAUDE_PLUGIN_DATA ends in "<plugin-name>-<identity>", so the identity this
    # hook was loaded under is directly observable; empty when undeterminable.
    base = Path(os.environ.get("CLAUDE_PLUGIN_DATA", "")).name
    prefix = "langfuse-observability-"
    return base[len(prefix):] if base.startswith(prefix) else ""

def log_missing_langfuse_config() -> None:
    missing = ", ".join(_missing_langfuse_keys()) or "unknown keys"
    msg = (
        f"Langfuse config incomplete: missing {missing} "
        "(checked CLAUDE_PLUGIN_OPTION_* and plain env vars); tracing disabled for this turn."
    )
    identity = _plugin_load_identity()
    if identity and identity != "langfuse-observability":
        msg += (
            f" Note: this hook was loaded under plugin identity '@{identity}'; options configured "
            "under '@langfuse-observability' are not delivered to it."
        )
    info(msg)


# ----------------- Logging -----------------
_logger: Optional[logging.Logger] = None

def _get_logger() -> Optional[logging.Logger]:
    global _logger
    if _logger is not None:
        return _logger
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        lg = logging.getLogger("langfuse_hook")
        lg.setLevel(logging.DEBUG if DEBUG else logging.INFO)
        if not lg.handlers:
            h = RotatingFileHandler(str(LOG_FILE), maxBytes=5_000_000, backupCount=3)
            h.setFormatter(logging.Formatter(
                "%(asctime)s [%(levelname)s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            ))
            lg.addHandler(h)
        _logger = lg
        return _logger
    except Exception:
        return None

def debug(msg: str) -> None:
    if not DEBUG:
        return
    lg = _get_logger()
    if lg is not None:
        try:
            lg.debug(msg)
        except Exception:
            pass

def info(msg: str) -> None:
    lg = _get_logger()
    if lg is not None:
        try:
            lg.info(msg)
        except Exception:
            pass


# ----------------- Langfuse import (fail-open) -----------------
# Everything above this guard runs before the SDK import and must stay
# stdlib-only and parseable on Python 3.9 so this failure path can log.
try:
    from langfuse import Langfuse, propagate_attributes
    from opentelemetry import trace as otel_trace_api
except Exception as e:
    info(
        f"langfuse import failed ({type(e).__name__}: {e}); "
        f"python={sys.version.split()[0]} executable={sys.executable} "
        f"PATH={os.environ.get('PATH', '')}. "
        "Hint: uv was not found on this PATH. If uv is installed, check that its "
        "location is on the PATH seen by the app that launches Claude Code; "
        "GUI apps often use a minimal PATH."
    )
    sys.exit(0)

# If this import fails, image capture falls back to text markers.
try:
    from langfuse.media import LangfuseMedia
except Exception:
    LangfuseMedia = None

def create_langfuse_client(config: LangfuseConfig) -> Optional[Langfuse]:
    # With capture off, stop the SDK from uploading base64 images it finds
    # in span payloads on its own. The SDK reads an empty value as enabled.
    if not CAPTURE_IMAGES and not os.environ.get("LANGFUSE_MEDIA_UPLOAD_ENABLED"):
        os.environ["LANGFUSE_MEDIA_UPLOAD_ENABLED"] = "false"
    try:
        return Langfuse(
            public_key=config.public_key,
            secret_key=config.secret_key,
            host=config.host,
        )
    except Exception as e:
        info(f"Langfuse client creation failed ({type(e).__name__}: {e}); tracing disabled for this turn")
        return None


# ----------------- Hook payload -----------------
def read_hook_payload() -> Dict[str, Any]:
    """
    Claude Code hooks pass a JSON payload on stdin.
    This script tolerates missing/empty stdin by returning {}.
    """
    try:
        data = sys.stdin.read()
        debug(f"stdin received {len(data)} chars")
        if not data.strip():
            return {}
        parsed = json.loads(data)
        if isinstance(parsed, dict):
            debug(f"payload top-level keys: {sorted(parsed.keys())}")
            return parsed
        debug(f"payload is {type(parsed).__name__}, expected object; exiting.")
        return {}
    except Exception as e:
        debug(f"read_hook_payload exception: {e!r}")
        return {}

def extract_session_id_and_transcript_path(payload: Dict[str, Any]) -> Tuple[Optional[str], Optional[Path]]:
    """
    Tries a few plausible field names; exact keys can vary across hook types/versions.
    Prefer structured values from stdin over heuristics.
    """
    session_id = (
        payload.get("sessionId")
        or payload.get("session_id")
        or payload.get("session", {}).get("id")
    )

    transcript_path_raw = (
        payload.get("transcriptPath")
        or payload.get("transcript_path")
        or payload.get("transcript", {}).get("path")
    )

    if transcript_path_raw:
        try:
            transcript_path = Path(transcript_path_raw).expanduser().resolve()
        except Exception:
            transcript_path = None
    else:
        transcript_path = None

    return session_id, transcript_path

def get_session_id_and_transcript_path(payload: Dict[str, Any]) -> Optional[Tuple[str, Path]]:
    session_id, transcript_path = extract_session_id_and_transcript_path(payload)

    if not session_id or not transcript_path:
        # No structured payload; fail open (do not guess).
        debug("Missing session_id or transcript_path from hook payload; exiting.")
        return None

    if not transcript_path.exists():
        debug(f"Transcript path does not exist: {transcript_path}")
        return None

    return session_id, transcript_path

def is_session_end_hook_payload(payload: Dict[str, Any]) -> bool:
    hook_event_name = payload.get("hook_event_name") or payload.get("hookEventName")
    return hook_event_name == "SessionEnd"


# ----------------- State file concurrency control -----------------
class FileLock:
    def __init__(self, path: Path, timeout_s: float = 2.0):
        self.path = path
        self.timeout_s = timeout_s
        self._fh = None

    def __enter__(self):
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.path, "a+", encoding="utf-8")
        self.acquired = False
        try:
            import fcntl  # Unix only
        except ImportError:
            # No fcntl available (e.g. Windows) — proceed without lock.
            return self
        deadline = time.time() + self.timeout_s
        try:
            while True:
                try:
                    fcntl.flock(self._fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    self.acquired = True
                    return self
                except BlockingIOError:
                    if time.time() > deadline:
                        raise TimeoutError(
                            f"could not acquire {self.path} within {self.timeout_s}s"
                        )
                    time.sleep(0.05)
        except BaseException:
            # __exit__ is not called when __enter__ raises — close the fh
            # we just opened so it doesn't leak.
            try:
                self._fh.close()
            except Exception:
                pass
            raise

    def __exit__(self, exc_type, exc, tb):
        try:
            import fcntl
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            self._fh.close()
        except Exception:
            pass


# ----------------- State file reading and writing -----------------
def load_hook_state() -> Dict[str, Any]:
    try:
        if not STATE_FILE.exists():
            return {}
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

def get_session_state_key(session_id: str, transcript_path: str) -> str:
    # stable key even if session_id collides
    raw = f"{session_id}::{transcript_path}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

@dataclass
class SessionState:
    offset: int = 0       # Last byte read from the transcript file.
    buffer: str = ""      # Partial JSONL line kept between hook runs.
    turn_count: int = 0   # Turns already emitted for this session.
    pending_agent_turns: List[Dict[str, Any]] = field(default_factory=list)
    # Task-notification rows whose tool_use_id could not be resolved yet
    # (task-id-only and the subagent meta.json not on disk); retried each run.
    pending_task_notifications: List[Dict[str, Any]] = field(default_factory=list)
    # Trailing turn kept while it may still continue; see build_open_turn
    # for the structure (rows plus emission cursor).
    open_turn: Dict[str, Any] = field(default_factory=dict)
    # Turn numbers assigned when a turn is first seen (keyed by its user-row
    # uuid), so a turn keeps its number regardless of when it is emitted.
    turn_numbers: Dict[str, int] = field(default_factory=dict)
    # Per-turn emission progress (keyed by user-row uuid): trace_id,
    # root_span_id and the keys of already-emitted observations. Carries a
    # partially emitted turn across firings and across the open -> closed ->
    # deferred transitions; entries are dropped once the turn is finalized.
    turn_progress: Dict[str, Dict[str, Any]] = field(default_factory=dict)

def get_session_state(global_state: Dict[str, Any], key: str) -> SessionState:
    s = global_state.get(key, {})
    pending_agent_turns = s.get("pending_agent_turns")
    if not isinstance(pending_agent_turns, list):
        pending_agent_turns = []
    pending_task_notifications = s.get("pending_task_notifications")
    if not isinstance(pending_task_notifications, list):
        pending_task_notifications = []
    open_turn = s.get("open_turn")
    if not isinstance(open_turn, dict):
        open_turn = {}
    turn_numbers = s.get("turn_numbers")
    if not isinstance(turn_numbers, dict):
        turn_numbers = {}
    turn_progress = s.get("turn_progress")
    if not isinstance(turn_progress, dict):
        turn_progress = {}
    return SessionState(
        offset=int(s.get("offset", 0)),
        buffer=str(s.get("buffer", "")),
        turn_count=int(s.get("turn_count", 0)),
        pending_agent_turns=pending_agent_turns,
        pending_task_notifications=pending_task_notifications,
        open_turn=open_turn,
        turn_numbers=turn_numbers,
        turn_progress=turn_progress,
    )

def update_session_state(global_state: Dict[str, Any], key: str, session_state: SessionState) -> None:
    global_state[key] = {
        "offset": session_state.offset,
        "buffer": session_state.buffer,
        "turn_count": session_state.turn_count,
        "pending_agent_turns": session_state.pending_agent_turns or [],
        "pending_task_notifications": session_state.pending_task_notifications or [],
        "open_turn": session_state.open_turn or {},
        "turn_numbers": session_state.turn_numbers or {},
        "turn_progress": session_state.turn_progress or {},
        "updated": datetime.now(timezone.utc).isoformat(),
    }

def save_hook_state(state: Dict[str, Any]) -> None:
    try:
        # Drop session entries older than 30 days to keep the file bounded.
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        for k in list(state.keys()):
            entry = state.get(k)
            if not isinstance(entry, dict):
                continue
            updated = entry.get("updated")
            if not isinstance(updated, str):
                continue
            try:
                ts = datetime.fromisoformat(updated.replace("Z", "+00:00"))
            except Exception:
                continue
            if ts < cutoff:
                del state[k]
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, STATE_FILE)
    except Exception as e:
        debug(f"save_hook_state failed: {e}")

def save_session_state(global_state: Dict[str, Any], key: str, session_state: SessionState) -> None:
    update_session_state(global_state, key, session_state)
    save_hook_state(global_state)


# ----------------- Transcript row parsing -----------------
def get_content_from_row(row: Dict[str, Any]) -> Any:
    if not isinstance(row, dict):
        return None
    message = row.get("message")
    if isinstance(message, dict):
        return message.get("content")
    return row.get("content")

def get_user_or_assistant_role_from_row(row: Dict[str, Any]) -> Optional[str]:
    # Claude Code transcript row format is internal. Prefer top-level row.type
    # when it marks a chat row, then fall back to nested message.role.
    row_type = row.get("type")
    if row_type in ("user", "assistant"):
        return row_type

    message = row.get("message")
    if isinstance(message, dict):
        role = message.get("role")
        if role in ("user", "assistant"):
            return role
    return None

def get_message_id(row: Dict[str, Any]) -> Optional[str]:
    m = row.get("message")
    if isinstance(m, dict):
        mid = m.get("id")
        if isinstance(mid, str) and mid:
            return mid
    return None

def get_model(row: Dict[str, Any]) -> str:
    m = row.get("message")
    if isinstance(m, dict):
        return m.get("model") or "claude"
    return "claude"

CACHE_WRITE_TTL_KEYS = (
    ("ephemeral_5m_input_tokens", "input_cache_creation_5m"),
    ("ephemeral_1h_input_tokens", "input_cache_creation_1h"),
)

def get_cache_write_details(usage: Dict[str, Any]) -> Dict[str, int]:
    """Map cache-write tokens onto the price key for each lifetime.

    The flat total says nothing about the lifetime, so it is priced at the
    cheaper rate. Use it only when the message omits the split.
    """
    details: Dict[str, int] = {}
    split = usage.get("cache_creation")
    if isinstance(split, dict):
        for src, dst in CACHE_WRITE_TTL_KEYS:
            v = split.get(src)
            if isinstance(v, int) and v > 0:
                details[dst] = v
    if details:
        return details
    v = usage.get("cache_creation_input_tokens")
    if isinstance(v, int) and v > 0:
        return {"cache_creation_input_tokens": v}
    return {}

def get_usage_details_from_row(row: Dict[str, Any]) -> Optional[Dict[str, int]]:
    """Extract Anthropic token usage from an assistant message, if present."""
    m = row.get("message")
    if not isinstance(m, dict):
        return None
    u = m.get("usage")
    if not isinstance(u, dict):
        return None
    details: Dict[str, int] = {}
    for src, dst in (
        ("input_tokens", "input"),
        ("output_tokens", "output"),
        ("cache_read_input_tokens", "cache_read_input_tokens"),
    ):
        v = u.get(src)
        if isinstance(v, int) and v > 0:
            details[dst] = v
    details.update(get_cache_write_details(u))
    return details or None

def get_speed_from_row(row: Dict[str, Any]) -> Optional[str]:
    """Extract the Anthropic request speed ("standard"/"fast") from an assistant message."""
    m = row.get("message")
    if not isinstance(m, dict):
        return None
    u = m.get("usage")
    if not isinstance(u, dict):
        return None
    speed = u.get("speed")
    if isinstance(speed, str) and speed:
        return speed
    return None

def parse_timestamp(value: Any) -> Optional[datetime]:
    """Parse a Claude Code jsonl row timestamp (ISO 8601 with trailing Z)."""
    if isinstance(value, dict):
        value = value.get("timestamp")
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None

def describe_image_block(block: Dict[str, Any]) -> str:
    """Make a short text marker for an image block's base64 payload."""
    source = block.get("source") if isinstance(block.get("source"), dict) else {}
    media_type = source.get("media_type") or "unknown type"
    data = source.get("data")
    if isinstance(data, str) and data:
        return f"[image {media_type} ~{len(data) * 3 // 4 // 1024}KB]"
    return f"[image {media_type}]"

def media_from_image_block(block: Dict[str, Any]) -> Optional[Any]:
    """Make a LangfuseMedia for a base64 image block. Return None when
    capture is off, media support is missing, or the block is malformed.
    The caller then keeps the text marker."""
    if not CAPTURE_IMAGES or LangfuseMedia is None:
        return None
    source = block.get("source") if isinstance(block.get("source"), dict) else {}
    media_type = source.get("media_type")
    data = source.get("data")
    if source.get("type") != "base64" or not isinstance(media_type, str) or not media_type or not isinstance(data, str) or not data:
        return None
    try:
        # The SDK does not raise on bad base64 and returns a hollow object
        # that serializes as garbage, so decode here and pass bytes directly.
        decoded = base64.b64decode("".join(data.split()), validate=True)
        return LangfuseMedia(content_bytes=decoded, content_type=media_type)
    except Exception as e:
        debug(f"LangfuseMedia creation failed ({type(e).__name__}: {e}); keeping text marker only")
        return None

def get_image_blocks(content: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "image":
                out.append(x)
    return out

def extract_text_from_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for x in content:
            if isinstance(x, dict) and x.get("type") == "text":
                parts.append(x.get("text", ""))
            elif isinstance(x, dict) and x.get("type") == "image":
                parts.append(describe_image_block(x))
            elif isinstance(x, str):
                parts.append(x)
        return "\n".join([p for p in parts if p])
    return ""

def truncate_text(s: str, max_chars: int = MAX_CHARS) -> Tuple[str, Dict[str, Any]]:
    if s is None:
        return "", {"truncated": False, "orig_len": 0}
    orig_len = len(s)
    if orig_len <= max_chars:
        return s, {"truncated": False, "orig_len": orig_len}
    head = s[:max_chars]
    return head, {"truncated": True, "orig_len": orig_len, "kept_len": len(head), "sha256": hashlib.sha256(s.encode("utf-8")).hexdigest()}

def get_tool_use_blocks(content: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "tool_use":
                out.append(x)
    return out

def get_tool_result_blocks(content: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if isinstance(content, list):
        for x in content:
            if isinstance(x, dict) and x.get("type") == "tool_result":
                out.append(x)
    return out

def is_tool_result(row: Dict[str, Any]) -> bool:
    role = get_user_or_assistant_role_from_row(row)
    if role != "user":
        return False
    content = get_content_from_row(row)
    if isinstance(content, list):
        return any(isinstance(x, dict) and x.get("type") == "tool_result" for x in content)
    return False


# ----------------- Incremental transcript reading -----------------
def read_new_jsonl(transcript_path: Path, session_state: SessionState) -> Tuple[List[Dict[str, Any]], SessionState]:
    """
    Reads only new bytes since session_state.offset. Keeps session_state.buffer for partial last line.
    Returns parsed JSON lines and updated state.
    """
    if not transcript_path.exists():
        return [], session_state

    try:
        file_size = transcript_path.stat().st_size
        if file_size < session_state.offset:
            # Transcript was rotated or truncated — restart from the beginning.
            debug(f"transcript shrank ({file_size} < {session_state.offset}); restarting")
            session_state.offset = 0
            session_state.buffer = ""
            # The held rows refer to the replaced file; re-reading from byte 0
            # would emit those turns a second time (and mix old rows into the
            # new stream), so drop all persisted turn state along with the offset.
            session_state.pending_agent_turns = []
            session_state.pending_task_notifications = []
            session_state.open_turn = {}
            session_state.turn_numbers = {}
            # Known limitation: rotation drops emission progress, so re-read
            # turns re-emit from scratch; an already-exported root keeps the
            # output/end time it was emitted with.
            session_state.turn_progress = {}
        with open(transcript_path, "rb") as f:
            f.seek(session_state.offset)
            chunk = f.read()
            new_offset = f.tell()
    except Exception as e:
        debug(f"read_new_jsonl failed: {e}")
        return [], session_state

    if not chunk:
        return [], session_state

    try:
        text = chunk.decode("utf-8", errors="replace")
    except Exception:
        text = chunk.decode(errors="replace")

    combined = session_state.buffer + text
    lines = combined.split("\n")
    # last element may be incomplete
    session_state.buffer = lines[-1]
    session_state.offset = new_offset

    msgs: List[Dict[str, Any]] = []
    for line in lines[:-1]:
        line = line.strip()
        if not line:
            continue
        try:
            msgs.append(json.loads(line))
        except Exception:
            continue

    return msgs, session_state


# ----------------- Turn assembly -----------------
@dataclass
class Turn:
    user_msg: Dict[str, Any]
    assistant_msgs: List[Dict[str, Any]]
    tool_results_by_id: Dict[str, Any]
    tool_use_timestamps_by_id: Dict[str, Any]
    # Injected context (e.g. skill instructions) keyed by the tool_use id it
    # belongs to, taken from isMeta rows carrying sourceToolUseID.
    injected_by_tool_id: Dict[str, str]
    rows: List[Dict[str, Any]]

@dataclass
class TurnAssemblyState:
    current_turn_user_row: Optional[Dict[str, Any]] = None
    assistant_message_ids: List[str] = field(default_factory=list)
    assistant_rows_by_message_id: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)
    tool_results_by_id: Dict[str, Any] = field(default_factory=dict)
    tool_use_timestamps_by_id: Dict[str, Any] = field(default_factory=dict)
    injected_by_tool_id: Dict[str, str] = field(default_factory=dict)
    current_rows: List[Dict[str, Any]] = field(default_factory=list)


def _extract_xml_tag_value(text: str, tag: str) -> Optional[str]:
    start = f"<{tag}>"
    end = f"</{tag}>"
    i = text.find(start)
    if i < 0:
        return None
    j = text.find(end, i + len(start))
    if j < 0:
        return None
    return text[i + len(start):j]

def is_task_notification_row(row: Dict[str, Any]) -> bool:
    origin = row.get("origin")
    if isinstance(origin, dict) and origin.get("kind") == "task-notification":
        return True

    notification_text = extract_text_from_content(get_content_from_row(row)).lstrip()
    return notification_text.startswith("<task-notification>")

def get_tool_use_id_from_task_notification(row: Dict[str, Any]) -> Optional[str]:
    notification_text = extract_text_from_content(get_content_from_row(row))
    tool_use_id = _extract_xml_tag_value(notification_text, "tool-use-id")
    return tool_use_id.strip() if isinstance(tool_use_id, str) and tool_use_id.strip() else None

def get_task_id_from_task_notification(row: Dict[str, Any]) -> Optional[str]:
    notification_text = extract_text_from_content(get_content_from_row(row))
    task_id = _extract_xml_tag_value(notification_text, "task-id")
    return task_id.strip() if isinstance(task_id, str) and task_id.strip() else None

def get_tool_use_id_for_task_notification(
    row: Dict[str, Any],
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    if not is_task_notification_row(row):
        return None

    tool_use_id = get_tool_use_id_from_task_notification(row)
    if tool_use_id:
        return tool_use_id

    task_id = get_task_id_from_task_notification(row)
    if task_id and task_id_to_tool_use_id:
        return task_id_to_tool_use_id.get(task_id)
    return None

def get_result_from_task_notification(row: Dict[str, Any]) -> str:
    notification_text = extract_text_from_content(get_content_from_row(row))
    result = _extract_xml_tag_value(notification_text, "result")
    return result if result is not None else notification_text

def _find_pending_agent_turn(
    session_state: SessionState,
    tool_use_id: str,
) -> Optional[Dict[str, Any]]:
    for pending_turn in session_state.pending_agent_turns:
        if not isinstance(pending_turn, dict):
            continue
        if not isinstance(pending_turn.get("rows"), list):
            continue
        pending_tool_use_ids = pending_turn.get("pending_tool_use_ids")
        resolved_tool_use_ids = pending_turn.get("resolved_tool_use_ids")
        # Notifications can arrive more than once per tool_use_id, so ids that
        # already received one keep matching until the whole turn resolves.
        if isinstance(pending_tool_use_ids, list) and tool_use_id in pending_tool_use_ids:
            return pending_turn
        if isinstance(resolved_tool_use_ids, list) and tool_use_id in resolved_tool_use_ids:
            return pending_turn
    return None

def resolve_deferred_agent_turns(
    rows: List[Dict[str, Any]],
    session_state: SessionState,
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> Tuple[List[List[Dict[str, Any]]], List[Dict[str, Any]]]:
    """Move task-notification rows from the batch to their deferred turns.

    Deferred rows are never spliced into the batch (a user row mid-batch would
    cut the current turn in half); resolved turns are returned for isolated
    assembly. Notifications matching a tool_use in the batch stay there, and
    ones that cannot be attributed yet (task-id-only, subagent meta.json not
    on disk) are stashed in the session state and retried on later runs
    instead of being swallowed by the turn assembly.
    """
    remaining_rows: List[Dict[str, Any]] = []
    stashed_notifications: List[Dict[str, Any]] = []

    def route_to_pending_turn(pending_turn: Dict[str, Any], row: Dict[str, Any], tool_use_id: str) -> None:
        pending_turn["rows"].append(row)
        pending_tool_use_ids = pending_turn.get("pending_tool_use_ids")
        if isinstance(pending_tool_use_ids, list) and tool_use_id in pending_tool_use_ids:
            pending_tool_use_ids.remove(tool_use_id)
            pending_turn.setdefault("resolved_tool_use_ids", []).append(tool_use_id)

    # Retry stashed notifications from earlier runs first (they are older than
    # anything in the batch); their task-id may resolve now. Entries matching
    # no deferred turn stay stashed: their owning turn may still be open and
    # only defer once a new user row closes it. Leftovers are cleared at
    # session end and the stash is size-capped.
    for row in session_state.pending_task_notifications:
        tool_use_id = get_tool_use_id_for_task_notification(row, task_id_to_tool_use_id)
        pending_turn = _find_pending_agent_turn(session_state, tool_use_id) if tool_use_id else None
        if pending_turn is None:
            stashed_notifications.append(row)
            continue
        route_to_pending_turn(pending_turn, row, tool_use_id)

    for row in rows:
        if not is_task_notification_row(row):
            remaining_rows.append(row)
            continue
        tool_use_id = get_tool_use_id_for_task_notification(row, task_id_to_tool_use_id)
        if tool_use_id is None:
            stashed_notifications.append(row)
            continue
        pending_turn = _find_pending_agent_turn(session_state, tool_use_id)
        if pending_turn is None:
            remaining_rows.append(row)
            continue
        route_to_pending_turn(pending_turn, row, tool_use_id)

    session_state.pending_task_notifications = stashed_notifications[-MAX_PENDING_TASK_NOTIFICATIONS:]

    # Pop fully resolved turns in deferral (i.e. chronological) order.
    resolved_turn_row_lists: List[List[Dict[str, Any]]] = []
    still_pending: List[Dict[str, Any]] = []
    for pending_turn in session_state.pending_agent_turns:
        if not isinstance(pending_turn, dict) or not isinstance(pending_turn.get("rows"), list):
            continue
        if pending_turn.get("pending_tool_use_ids"):
            still_pending.append(pending_turn)
            continue
        resolved_turn_row_lists.append(pending_turn["rows"])
    session_state.pending_agent_turns = still_pending

    return resolved_turn_row_lists, remaining_rows

def pop_all_deferred_agent_turn_row_lists(
    session_state: SessionState,
) -> List[List[Dict[str, Any]]]:
    row_lists: List[List[Dict[str, Any]]] = []
    for pending_turn in session_state.pending_agent_turns:
        if not isinstance(pending_turn, dict):
            continue
        rows = pending_turn.get("rows")
        if isinstance(rows, list) and rows:
            row_lists.append(rows)
    session_state.pending_agent_turns = []
    return row_lists

def get_tool_result_text(tool_result_entry: Any) -> str:
    if not isinstance(tool_result_entry, dict):
        return ""
    tool_result_content = tool_result_entry.get("content")
    if isinstance(tool_result_content, str):
        return tool_result_content
    return json.dumps(tool_result_content, ensure_ascii=False)

def get_async_launch_flag_from_row(row: Dict[str, Any]) -> Optional[bool]:
    """Read the structured async marker Claude Code puts on tool_result rows.

    Returns None when the row carries no toolUseResult (older Claude Code
    versions), so callers can fall back to the launch-text heuristic.
    """
    tool_use_result = row.get("toolUseResult")
    if not isinstance(tool_use_result, dict):
        return None
    # A teammate launch is async too: its result never carries the final output.
    if tool_use_result.get("status") in ("async_launched", "teammate_spawned"):
        return True
    return tool_use_result.get("isAsync") is True

def get_workflow_launch_marker_from_row(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Read the structured Workflow launch marker from a tool_result row.

    Workflow launches carry toolUseResult.taskType == "local_workflow" plus
    the runId that names the run's transcript directory
    (<transcript_stem>/subagents/workflows/<runId>/). Only the structured
    marker is trusted, the launch text is never parsed.
    """
    tool_use_result = row.get("toolUseResult")
    if not isinstance(tool_use_result, dict):
        return None
    if tool_use_result.get("taskType") != "local_workflow":
        return None
    run_id = tool_use_result.get("runId")
    if not isinstance(run_id, str) or not run_id:
        return None
    workflow_launch_marker: Dict[str, Any] = {"run_id": run_id}
    workflow_name = tool_use_result.get("workflowName")
    if isinstance(workflow_name, str) and workflow_name:
        workflow_launch_marker["workflow_name"] = workflow_name
    return workflow_launch_marker

def is_async_agent_launch_result(tool_result_entry: Any) -> bool:
    if not isinstance(tool_result_entry, dict):
        return False
    # Prefer the structured toolUseResult marker: launch-text matching also
    # fires on tool results that merely quote it (e.g. reading this file).
    is_async_launch = tool_result_entry.get("is_async_launch")
    if is_async_launch is not None:
        return bool(is_async_launch)
    tool_result_text = get_tool_result_text(tool_result_entry)
    return (
        "Async agent launched successfully" in tool_result_text
        or (
            "agentId:" in tool_result_text
            and "output_file:" in tool_result_text
            and "You will be notified automatically" in tool_result_text
        )
    )

def get_pending_agent_tool_use_ids(turn: Turn) -> List[str]:
    tool_use_ids: List[str] = []
    for assistant_message in turn.assistant_msgs:
        for tool_use_block in get_tool_use_blocks(get_content_from_row(assistant_message)):
            # Workflows resolve via task notifications too, so they hold the turn open.
            if tool_use_block.get("name") not in ("Agent", "Task", "Workflow"):
                continue
            tool_use_id = str(tool_use_block.get("id") or "")
            if not tool_use_id:
                continue
            tool_result_entry = turn.tool_results_by_id.get(tool_use_id)
            if isinstance(tool_result_entry, dict) and tool_result_entry.get("final_content") is not None:
                continue
            # Defer only explicit async launches: sync agents also write a
            # subagent transcript but never notify, so deferring on transcript
            # existence would strand their turns.
            if is_async_agent_launch_result(tool_result_entry):
                tool_use_ids.append(tool_use_id)
    return tool_use_ids


def get_undelivered_queued_notification_ids(rows: List[Dict[str, Any]]) -> List[str]:
    """Tool-use ids of task notifications that were enqueued (queue-operation
    rows) but not yet delivered as a user row.

    A queued result already fills the launch entry's final_content, so the
    pending-agents check goes clean — yet the turn provably continues: the
    delivery row and Claude's follow-up response are still outstanding.
    Queue remove rows carry no notification content and cannot be matched, so
    a removed notification keeps the gate closed until the turn ends — the
    safe direction (close-time emission is always correct).
    """
    queued: List[str] = []
    delivered = set()
    for row in rows:
        if not is_task_notification_row(row):
            continue
        tool_use_id = get_tool_use_id_from_task_notification(row)
        if not tool_use_id:
            continue
        if row.get("type") == "queue-operation":
            queued.append(tool_use_id)
        else:
            delivered.add(tool_use_id)
    return [tool_use_id for tool_use_id in queued if tool_use_id not in delivered]


def turn_has_unresolved_async_activity(turn: Turn) -> bool:
    """True while the turn's emitted form can provably still change: an async
    agent has not delivered its final result, or a notification is queued but
    not yet delivered. Exported roots are immutable, so emission must wait
    for this gate (or for the turn to close)."""
    return bool(
        get_pending_agent_tool_use_ids(turn)
        or get_undelivered_queued_notification_ids(turn.rows)
    )


def get_turns_to_emit(
    turns: List[Turn],
    session_state: SessionState,
    *,
    flush_deferred_agent_turns: bool = False,
) -> List[Turn]:
    turns_to_emit: List[Turn] = []
    for turn in turns:
        pending_agent_tool_use_ids = get_pending_agent_tool_use_ids(turn)
        if pending_agent_tool_use_ids:
            if flush_deferred_agent_turns:
                debug(f"Emitting async agent turn without task notification: {pending_agent_tool_use_ids}")
                turns_to_emit.append(turn)
                continue
            session_state.pending_agent_turns.append({
                "pending_tool_use_ids": pending_agent_tool_use_ids,
                "rows": turn.rows,
            })
            debug(f"Deferred agent turn until task notification: {pending_agent_tool_use_ids}")
            continue
        turns_to_emit.append(turn)
    return turns_to_emit


def add_injected_context_row(row: Dict[str, Any], state: TurnAssemblyState) -> bool:
    # Injected user rows (slash-command expansions, caveats, skill instructions)
    # carry isMeta=true. They are not real prompts, so they must not start turns.
    if not row.get("isMeta"):
        return False

    # Skill invocations link their injected instructions to the originating
    # tool_use via sourceToolUseID; keep the text so emit can optionally attach
    # it to that tool span.
    source_tool_use_id = row.get("sourceToolUseID")
    if source_tool_use_id:
        text = extract_text_from_content(get_content_from_row(row))
        if text:
            state.injected_by_tool_id[str(source_tool_use_id)] = text
            state.current_rows.append(row)
    return True

def add_tool_result_row(row: Dict[str, Any], state: TurnAssemblyState) -> bool:
    # tool_result rows show up as role=user with content blocks of type tool_result.
    if not is_tool_result(row):
        return False

    state.current_rows.append(row)
    row_timestamp = row.get("timestamp")
    is_async_launch = get_async_launch_flag_from_row(row)
    workflow_launch_marker = get_workflow_launch_marker_from_row(row)
    for tool_result_block in get_tool_result_blocks(get_content_from_row(row)):
        tool_use_id = tool_result_block.get("tool_use_id")
        if tool_use_id:
            tool_result_entry: Dict[str, Any] = {
                "content": tool_result_block.get("content"),
                "timestamp": row_timestamp,
            }
            if is_async_launch is not None:
                tool_result_entry["is_async_launch"] = is_async_launch
            if workflow_launch_marker is not None:
                # Links the launching tool_use to its workflow run so emission
                # can attach the run's agent transcripts (which have no
                # toolUseId of their own) under this tool's span.
                tool_result_entry["workflow_run_id"] = workflow_launch_marker["run_id"]
                if "workflow_name" in workflow_launch_marker:
                    tool_result_entry["workflow_name"] = workflow_launch_marker["workflow_name"]
            state.tool_results_by_id[str(tool_use_id)] = tool_result_entry
    return True

def add_task_notification_row(
    row: Dict[str, Any],
    state: TurnAssemblyState,
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
    closed_turns: Optional[List[Turn]] = None,
) -> bool:
    if not is_task_notification_row(row):
        return False

    tool_use_id = get_tool_use_id_for_task_notification(row, task_id_to_tool_use_id)
    if not tool_use_id:
        if state.current_turn_user_row is not None:
            state.current_rows.append(row)
        return True

    if state.current_turn_user_row is not None:
        existing_result = state.tool_results_by_id.get(tool_use_id)
        if isinstance(existing_result, dict):
            existing_result["final_content"] = get_result_from_task_notification(row)
            existing_result["final_timestamp"] = row.get("timestamp")
            state.current_rows.append(row)
            return True

    # The launching turn may have been closed earlier in this same batch (a
    # new user row arrived before the notification did).
    for closed_turn in reversed(closed_turns or []):
        closed_result = closed_turn.tool_results_by_id.get(tool_use_id)
        if isinstance(closed_result, dict):
            closed_result["final_content"] = get_result_from_task_notification(row)
            closed_result["final_timestamp"] = row.get("timestamp")
            closed_turn.rows.append(row)
            return True

    if state.current_turn_user_row is None:
        return True
    state.tool_results_by_id[tool_use_id] = {
        "content": get_result_from_task_notification(row),
        "timestamp": row.get("timestamp"),
    }
    state.current_rows.append(row)
    return True

def merge_assistant_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Claude Code can split one assistant message across multiple JSONL rows that
    share message.id. Merge them back into one logical message by concatenating
    content blocks in row order.
    """
    base: Dict[str, Any] = dict(rows[-1])
    last_message = rows[-1].get("message")
    merged_message: Dict[str, Any] = dict(last_message) if isinstance(last_message, dict) else {}

    merged_content: List[Any] = []
    for row in rows:
        message_obj = row.get("message")
        if not isinstance(message_obj, dict):
            continue

        content_blocks = message_obj.get("content")
        if isinstance(content_blocks, list):
            merged_content.extend(content_blocks)
        elif isinstance(content_blocks, str) and content_blocks:
            merged_content.append({"type": "text", "text": content_blocks})

    merged_message["content"] = merged_content
    base["message"] = merged_message
    return base

def build_turn_from_state(state: TurnAssemblyState) -> Optional[Turn]:
    if state.current_turn_user_row is None:
        return None
    if not state.assistant_rows_by_message_id:
        return None

    # Rebuild one assistant message per message.id, in the order the ids
    # first appeared. assistant_rows_by_message_id[message_id] holds all raw
    # rows that shared that id; merge_assistant_rows concatenates their content
    # blocks into one.
    merged_assistant_rows: List[Dict[str, Any]] = []
    for message_id in state.assistant_message_ids:
        rows_for_id = state.assistant_rows_by_message_id.get(message_id)
        if not rows_for_id:
            continue
        merged_assistant_rows.append(merge_assistant_rows(rows_for_id))

    return Turn(
        user_msg=state.current_turn_user_row,
        assistant_msgs=merged_assistant_rows,
        tool_results_by_id=dict(state.tool_results_by_id),
        tool_use_timestamps_by_id=dict(state.tool_use_timestamps_by_id),
        injected_by_tool_id=dict(state.injected_by_tool_id),
        rows=list(state.current_rows),
    )

def start_new_turn(row: Dict[str, Any], state: TurnAssemblyState) -> None:
    state.current_turn_user_row = row
    state.assistant_message_ids = []
    state.assistant_rows_by_message_id = {}
    state.tool_results_by_id = {}
    state.tool_use_timestamps_by_id = {}
    state.injected_by_tool_id = {}
    state.current_rows = [row]


def add_assistant_row(row: Dict[str, Any], state: TurnAssemblyState) -> None:
    if state.current_turn_user_row is None:
        # Ignore assistant rows until we see a user message.
        return

    message_id = get_message_id(row) or f"noid:{len(state.assistant_message_ids)}"
    if message_id not in state.assistant_rows_by_message_id:
        state.assistant_message_ids.append(message_id)
        state.assistant_rows_by_message_id[message_id] = []
    state.assistant_rows_by_message_id[message_id].append(row)

    for tool_use_block in get_tool_use_blocks(get_content_from_row(row)):
        tool_use_id = tool_use_block.get("id")
        if tool_use_id:
            state.tool_use_timestamps_by_id.setdefault(str(tool_use_id), row.get("timestamp"))
    state.current_rows.append(row)


def assemble_turns(
    rows: List[Dict[str, Any]],
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> Tuple[List[Turn], Optional[Turn], List[Dict[str, Any]]]:
    """
    Groups incremental transcript rows into turns:
    user (non-tool-result) -> assistant messages -> (tool_result rows, possibly interleaved)
    Uses:
    - assistant rows merged by message.id (all content blocks concatenated)
    - tool results dedupe by tool_use_id (latest wins)

    Returns (closed_turns, trailing_turn, trailing_turn_rows). The trailing
    turn is the one still open at the end of the rows: only a following user
    row proves a turn is complete, so incremental callers keep its raw rows
    and re-attach them to the next batch instead of emitting it right away.
    """
    turns: List[Turn] = []
    state = TurnAssemblyState()

    for row in rows:
        if add_injected_context_row(row, state):
            continue

        if add_tool_result_row(row, state):
            continue

        if add_task_notification_row(row, state, task_id_to_tool_use_id, closed_turns=turns):
            continue

        role = get_user_or_assistant_role_from_row(row)

        if role == "user":
            turn = build_turn_from_state(state)
            if turn is not None:
                turns.append(turn)

            start_new_turn(row, state)
            continue

        if role == "assistant":
            add_assistant_row(row, state)
            continue

        # ignore unknown rows

    trailing_turn = build_turn_from_state(state)
    trailing_turn_rows = list(state.current_rows) if state.current_turn_user_row is not None else []
    return turns, trailing_turn, trailing_turn_rows


def build_turns(
    rows: List[Dict[str, Any]],
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> List[Turn]:
    """Group a complete row list into turns, including the trailing one."""
    turns, trailing_turn, _ = assemble_turns(rows, task_id_to_tool_use_id)
    if trailing_turn is not None:
        turns.append(trailing_turn)
    return turns


def build_open_turn(trailing_turn: Optional[Turn],
                    trailing_turn_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Package the trailing turn for the session state. Emission progress is
    NOT kept here: it lives in session_state.turn_progress (keyed by the
    user-row uuid) so it survives the open -> closed -> deferred transitions."""
    if not trailing_turn_rows:
        return {}
    if trailing_turn is not None:
        user_row_uuid = trailing_turn.user_msg.get("uuid")
    else:
        user_row_uuid = trailing_turn_rows[0].get("uuid")
    return {
        "user_row_uuid": user_row_uuid,
        "rows": trailing_turn_rows,
    }


def assign_turn_numbers(turns: List[Turn], trailing_turn: Optional[Turn],
                        session_state: SessionState) -> None:
    """Assigns each turn its number the first time it is seen (in transcript
    order). Keyed by the turn's user-row uuid. Numbering seeds past
    max(turn_count, highest assigned) so a cleared or missing turn_numbers
    dict (rotation, legacy state files) cannot restart numbering at 1."""
    trailing = [trailing_turn] if trailing_turn is not None else []
    next_turn_number = 1 + max(
        session_state.turn_count,
        max(session_state.turn_numbers.values(), default=0),
    )
    for turn in turns + trailing:
        user_row_uuid = turn.user_msg.get("uuid")
        if not isinstance(user_row_uuid, str) or not user_row_uuid:
            continue
        if user_row_uuid not in session_state.turn_numbers:
            session_state.turn_numbers[user_row_uuid] = next_turn_number
            next_turn_number += 1


def get_new_turns_from_transcript(
    transcript_path: Path,
    session_state: SessionState,
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
    *,
    flush_deferred_agent_turns: bool = False,
) -> Tuple[List[Turn], SessionState]:
    rows, session_state = read_new_jsonl(transcript_path, session_state)
    task_id_to_tool_use_id = get_task_id_to_tool_use_id(subagent_transcripts_by_tool_use_id)

    # Re-attach the trailing open turn from the previous run. Stop fires
    # multiple times within one logical turn, so a batch can begin with
    # user-less continuation rows (task notifications, assistant rows); with
    # the open turn's rows in front they attach to it instead of being
    # dropped by turn assembly.
    previous_open_turn = session_state.open_turn if isinstance(session_state.open_turn, dict) else {}
    held_rows = previous_open_turn.get("rows")
    if isinstance(held_rows, list) and held_rows:
        rows = held_rows + rows
        session_state.open_turn = {}

    deferred_turn_row_lists, rows = resolve_deferred_agent_turns(rows, session_state, task_id_to_tool_use_id)

    if flush_deferred_agent_turns and session_state.pending_agent_turns:
        flushed_row_lists = pop_all_deferred_agent_turn_row_lists(session_state)
        if flushed_row_lists:
            debug(f"Flushing {len(flushed_row_lists)} deferred agent turn(s) without task notification")
            deferred_turn_row_lists = deferred_turn_row_lists + flushed_row_lists

    if flush_deferred_agent_turns and session_state.pending_task_notifications:
        # Last chance: appended to the row stream, a stashed notification can
        # still attach to the (reattached) open turn or a turn closed in this
        # batch; anything unmatched is discarded with the session.
        debug(f"Replaying {len(session_state.pending_task_notifications)} stashed task notification(s) at session end")
        rows = rows + session_state.pending_task_notifications
        session_state.pending_task_notifications = []

    # Each deferred row list is a complete turn from an earlier hook run, so
    # it is rebuilt in isolation and emitted before the current batch (its
    # rows are always chronologically older than anything in the batch).
    turns: List[Turn] = []
    for deferred_turn_rows in deferred_turn_row_lists:
        turns.extend(build_turns(deferred_turn_rows, task_id_to_tool_use_id))

    batch_turns, trailing_turn, trailing_turn_rows = assemble_turns(rows, task_id_to_tool_use_id)
    turns.extend(batch_turns)

    if flush_deferred_agent_turns:
        # SessionEnd: nothing can continue the trailing turn anymore.
        if trailing_turn is not None:
            turns.append(trailing_turn)
    else:
        session_state.open_turn = build_open_turn(trailing_turn, trailing_turn_rows)
        if trailing_turn_rows:
            debug(f"Holding trailing open turn ({len(trailing_turn_rows)} row(s)) until a new user row closes it")

    assign_turn_numbers(turns, trailing_turn, session_state)
    return turns, session_state

def resolve_agent_jsonl_and_id(meta_path: Path) -> Optional[Tuple[Path, str]]:
    """Derive an agent's transcript path and agent id from its meta.json path.

    Returns None when the sibling .jsonl is missing (metas without a
    transcript identify nothing worth emitting)."""
    jsonl_path = meta_path.with_name(meta_path.name[: -len(".meta.json")] + ".jsonl")
    if not jsonl_path.exists():
        return None
    agent_id = meta_path.name[: -len(".meta.json")]
    if agent_id.startswith("agent-"):
        agent_id = agent_id[len("agent-"):]
    return jsonl_path, agent_id

def get_agent_launch_tool_use_ids_by_name(transcript_path: Path) -> Dict[str, str]:
    """Map each agent name to the tool_use id of its launch.
    The function streams the full transcript. It removes ambiguous names."""
    mapping: Dict[str, str] = {}
    ambiguous: set = set()
    try:
        with transcript_path.open(encoding="utf-8") as lines:
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except Exception:
                    continue
                if not isinstance(row, dict):
                    continue
                for tool_use in get_tool_use_blocks(get_content_from_row(row)):
                    tool_use_id = str(tool_use.get("id") or "")
                    tool_input = tool_use.get("input")
                    if tool_use.get("name") not in ("Agent", "Task") or not tool_use_id:
                        continue
                    name = tool_input.get("name") if isinstance(tool_input, dict) else None
                    if not isinstance(name, str) or not name:
                        continue
                    if mapping.get(name, tool_use_id) != tool_use_id:
                        ambiguous.add(name)
                    mapping[name] = tool_use_id
    except Exception:
        return {}
    return {name: tool_use_id for name, tool_use_id in mapping.items() if name not in ambiguous}

def get_subagent_transcripts_by_tool_use_id(transcript_path: Path) -> Dict[str, Dict[str, Any]]:
    """Map launching Agent/Task tool_use ids to their subagent transcripts."""
    subagent_dir = transcript_path.with_suffix("") / "subagents"
    if not subagent_dir.is_dir():
        return {}

    # Build the fallback map only when a meta has no toolUseId.
    fallback_tool_use_ids: Optional[Dict[str, str]] = None
    claimed_twice: set = set()
    subagent_transcripts_by_tool_use_id: Dict[str, Dict[str, Any]] = {}
    for meta_path in sorted(subagent_dir.glob("*.meta.json")):
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(metadata, dict):
            continue

        resolved = resolve_agent_jsonl_and_id(meta_path)
        if resolved is None:
            continue
        jsonl_path, agent_id = resolved

        tool_use_id = metadata.get("toolUseId")
        if not isinstance(tool_use_id, str) or not tool_use_id:
            if fallback_tool_use_ids is None:
                fallback_tool_use_ids = get_agent_launch_tool_use_ids_by_name(transcript_path)
            # A teammate meta carries the launch input.name.
            name = metadata.get("name")
            tool_use_id = fallback_tool_use_ids.get(name) if isinstance(name, str) else None
        if not tool_use_id:
            info(f"subagent transcript not attributable to a launching tool_use, skipping: {meta_path}")
            continue
        if tool_use_id in claimed_twice or tool_use_id in subagent_transcripts_by_tool_use_id:
            # Two metas claim one launch -> Drop both.
            claimed_twice.add(tool_use_id)
            subagent_transcripts_by_tool_use_id.pop(tool_use_id, None)
            info(f"multiple subagent metas claim tool_use {tool_use_id}, skipping: {meta_path}")
            continue

        subagent_transcripts_by_tool_use_id[tool_use_id] = {
            "path": jsonl_path,
            "agent_id": agent_id,
            "agent_type": metadata.get("agentType"),
            "description": metadata.get("description"),
        }
    return subagent_transcripts_by_tool_use_id

def get_workflow_journal_results(run_dir: Path) -> Dict[str, Any]:
    """Per-agent return values from a workflow run's journal.jsonl.

    The journal carries {"type":"result","agentId",...,"result":{...}} rows,
    one per completed agent; unparseable lines are skipped."""
    journal_path = run_dir / "journal.jsonl"
    try:
        lines = journal_path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return {}
    results_by_agent_id: Dict[str, Any] = {}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            journal_row = json.loads(line)
        except Exception:
            continue
        if not isinstance(journal_row, dict) or journal_row.get("type") != "result":
            continue
        agent_id = journal_row.get("agentId")
        if isinstance(agent_id, str) and agent_id:
            results_by_agent_id[agent_id] = journal_row.get("result")
    return results_by_agent_id

def get_workflow_agents_in_run_dir(run_dir: Path) -> List[Dict[str, Any]]:
    """The workflow-spawned agent transcripts of one Workflow run directory.

    Workflow-tool agents live under <stem>/subagents/workflows/<runId>/;
    their meta.json carries agentType=="workflow-subagent" and — unlike
    classic subagents — no toolUseId, so a run is identified by its directory
    name instead. The launching tool_use is linked via toolUseResult.runId on
    the parent transcript's tool_result row (see
    get_workflow_launch_marker_from_row).
    """
    if not run_dir.is_dir():
        return []

    journal_results = get_workflow_journal_results(run_dir)
    agents: List[Dict[str, Any]] = []
    for meta_path in sorted(run_dir.glob("agent-*.meta.json")):
        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(metadata, dict) or metadata.get("agentType") != "workflow-subagent":
            continue

        resolved = resolve_agent_jsonl_and_id(meta_path)
        if resolved is None:
            continue
        jsonl_path, agent_id = resolved

        agents.append({
            "path": jsonl_path,
            "agent_id": agent_id,
            "agent_type": metadata.get("agentType"),
            "result": journal_results.get(agent_id),
        })
    return agents


class WorkflowAgentTranscriptsByRunId:
    """Per-run lookup of workflow-spawned agent transcripts. It reads on demand.

    The first lookup of a run id reads that run directory. The lookup then keeps
    the result for its own life, which is one hook firing. Thus only a firing
    that emits a reference to a run reads that run, and it always reads the
    current files."""

    def __init__(self, transcript_path: Path) -> None:
        self._workflows_dir = transcript_path.with_suffix("") / "subagents" / "workflows"
        self._agents_by_run_id: Dict[str, List[Dict[str, Any]]] = {}

    def get(self, run_id: Optional[str]) -> Optional[List[Dict[str, Any]]]:
        if not isinstance(run_id, str) or not run_id:
            return None
        # A run id comes from transcript data, and this method makes a path from
        # it. Thus the method must accept only a single plain directory name.
        # The name test rejects each other shape, but not "..", whose Path.name
        # is ".." again.
        if run_id == ".." or run_id != Path(run_id).name:
            return None
        if run_id not in self._agents_by_run_id:
            try:
                agents = get_workflow_agents_in_run_dir(self._workflows_dir / run_id)
            except OSError as e:
                # The file system can refuse a run path, for example when the
                # name is too long. Such a failure must not stop the turn.
                debug(f"Workflow run {run_id} not readable: {e}")
                agents = []
            if agents:
                debug(f"Discovered {len(agents)} workflow agent transcript(s) for run {run_id}")
            self._agents_by_run_id[run_id] = agents
        return self._agents_by_run_id[run_id] or None

def get_task_id_to_tool_use_id(
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]],
) -> Dict[str, str]:
    task_id_to_tool_use_id: Dict[str, str] = {}
    if not subagent_transcripts_by_tool_use_id:
        return task_id_to_tool_use_id

    for tool_use_id, subagent in subagent_transcripts_by_tool_use_id.items():
        agent_id = subagent.get("agent_id")
        if isinstance(agent_id, str) and agent_id:
            task_id_to_tool_use_id[agent_id] = tool_use_id
    return task_id_to_tool_use_id


# ----------------- Langfuse emit -----------------

# ---- Low-level Langfuse helpers ----
def to_otel_nanoseconds(ts: Optional[datetime]) -> Optional[int]:
    """Convert a datetime to OTel-style nanoseconds since epoch.

    Rounded at microsecond precision: naive float math (timestamp() * 1e9
    truncated with int()) lands just below the exact millisecond for many
    values, shifting emitted times by -1ms vs the transcript.
    """
    if ts is None:
        return None
    return round(ts.timestamp() * 1_000_000) * 1_000

def _get_latest_timestamp(*timestamps: Optional[datetime]) -> Optional[datetime]:
    present_timestamps = [timestamp for timestamp in timestamps if timestamp is not None]
    return max(present_timestamps) if present_timestamps else None

# ---- Deterministic trace ids ----
def _is_valid_trace_id_hex(trace_id: Any) -> bool:
    if not isinstance(trace_id, str) or len(trace_id) != 32:
        return False
    try:
        return int(trace_id, 16) != 0
    except ValueError:
        return False

def derive_turn_trace_id(trace_seed: str, turn_number: int) -> Optional[str]:
    """Derive the deterministic W3C trace id for a turn from CC_LANGFUSE_TRACE_SEED.

    Formula: Langfuse.create_trace_id(seed=f"{trace_seed}:{turn_number}") — which
    is sha256(seed_string).hexdigest()[:32]. The explicit sha256 fallback keeps
    IDs identical to what external callers precompute with the SDK helper even
    if the helper itself is unavailable.
    """
    seed_string = f"{trace_seed}:{turn_number}"
    try:
        create_trace_id = getattr(Langfuse, "create_trace_id", None)
        if callable(create_trace_id):
            trace_id = create_trace_id(seed=seed_string)
            if _is_valid_trace_id_hex(trace_id):
                return trace_id.lower()
    except Exception as e:
        debug(f"Langfuse.create_trace_id failed for {seed_string!r}: {e}")
    try:
        return hashlib.sha256(seed_string.encode("utf-8")).hexdigest()[:32]
    except Exception:
        return None

def _build_forced_trace_context(trace_id_hex: str,
                                parent_span_id_hex: Optional[str] = None) -> Optional[Any]:
    """Build an OTel context whose remote parent carries the forced trace id.

    A root span started within this context adopts the trace id; its children
    keep inheriting it as usual. Without parent_span_id_hex the parent gets a
    phantom span id that never exports (the span becomes the trace's root);
    with it (attached mode) the span nests under that externally exported
    span. Returns None (caller falls back to an auto-generated id) when the
    context cannot be built.
    """
    try:
        trace_id = int(trace_id_hex, 16)
        if trace_id == 0:
            return None
        span_id = int(parent_span_id_hex, 16) if parent_span_id_hex else 0
        while span_id == 0:
            span_id = random.getrandbits(64)
        parent_span_context = otel_trace_api.SpanContext(
            trace_id=trace_id,
            span_id=span_id,
            is_remote=True,
            trace_flags=otel_trace_api.TraceFlags(otel_trace_api.TraceFlags.SAMPLED),
        )
        return otel_trace_api.set_span_in_context(
            otel_trace_api.NonRecordingSpan(parent_span_context)
        )
    except Exception as e:
        debug(f"forced trace context for {trace_id_hex!r} failed: {e}")
        return None

def _start_root_otel_span(langfuse: Langfuse, name: str, start_ns: Optional[int],
                          forced_trace_id: Optional[str],
                          forced_parent_span_id: Optional[str] = None) -> Any:
    if forced_trace_id:
        context = _build_forced_trace_context(forced_trace_id, forced_parent_span_id)
        if context is not None:
            try:
                return langfuse._otel_tracer.start_span(name=name, start_time=start_ns, context=context)
            except Exception as e:
                debug(f"start_span with forced trace id {forced_trace_id!r} failed: {e}")
    return langfuse._otel_tracer.start_span(name=name, start_time=start_ns)

def _start_backdated(langfuse: Langfuse, *, name: str, as_type: str,
                     start_time: Optional[datetime],
                     parent_otel_span: Any = None,
                     as_root: bool = False,
                     forced_trace_id: Optional[str] = None,
                     forced_parent_span_id: Optional[str] = None,
                     **obs_kwargs: Any) -> Any:
    """Create a Langfuse observation with an explicit OTel start_time.

    Bypasses langfuse.start_observation() (which has no start_time kwarg in
    SDK 4.x) by talking to the underlying OTel tracer directly and then
    wrapping the resulting span with the Langfuse observation type.

    Depends on SDK 4.x internals: langfuse._otel_tracer and
    langfuse._create_observation_from_otel_span. If a future SDK version
    renames or removes these, raise a clear error instead of letting an
    AttributeError get swallowed by the broad emit_turn handler.
    """
    if not hasattr(langfuse, "_otel_tracer") or not hasattr(langfuse, "_create_observation_from_otel_span"):
        try:
            sdk_version = getattr(__import__("langfuse"), "__version__", "unknown")
        except Exception:
            sdk_version = "unknown"
        raise RuntimeError(
            f"Langfuse SDK {sdk_version} is missing _otel_tracer or "
            f"_create_observation_from_otel_span. This hook targets SDK 4.x; "
            f"pin with `pip install \"langfuse>=4.7,<5\"` or update the hook script."
        )
    start_ns = to_otel_nanoseconds(start_time)
    if parent_otel_span is not None:
        with otel_trace_api.use_span(parent_otel_span, end_on_exit=False):
            otel_span = langfuse._otel_tracer.start_span(name=name, start_time=start_ns)
    else:
        otel_span = _start_root_otel_span(langfuse, name, start_ns, forced_trace_id, forced_parent_span_id)
    if as_root:
        # SDK/server contract: spans under a synthetic trace-id carrier have a
        # parentSpanId that never exports, so the server only treats them as
        # the trace root (deriving trace input/output/name) with this marker.
        otel_span.set_attribute("langfuse.internal.as_root", True)
    else:
        # The SDK span processor auto-marks spans whose parent this process
        # never exported as langfuse.internal.is_app_root — true for every
        # continuation-firing child under the carrier, which then shows up as
        # a root in the events view. Children are never app roots; overriding
        # the attribute wins over the processor's earlier write.
        otel_span.set_attribute("langfuse.internal.is_app_root", False)
    return langfuse._create_observation_from_otel_span(
        otel_span=otel_span,
        as_type=as_type,
        **obs_kwargs,
    )

# ---- Trace naming and tags ----
def add_skill_tags_from_rows(rows: List[Dict[str, Any]], names: List[str], prefix: str) -> None:
    """Collect '<prefix><name>' tags for every skill trail in the rows.

    Skills leave two different transcript trails: a tool_use block named
    "Skill" when Claude invokes the skill itself, and a top-level
    attributionSkill field on assistant rows when the user invokes it as a
    slash command (which never produces a Skill tool_use block).
    """
    def add_skill(skill: Any) -> None:
        if isinstance(skill, str) and skill and f"{prefix}{skill}" not in names:
            names.append(f"{prefix}{skill}")

    for row in rows:
        if not isinstance(row, dict):
            continue
        add_skill(row.get("attributionSkill"))
        for tool_use in get_tool_use_blocks(get_content_from_row(row)):
            if tool_use.get("name") != "Skill":
                continue
            tool_input = tool_use.get("input")
            add_skill(tool_input.get("skill") if isinstance(tool_input, dict) else None)


def collect_skill_tags(turn: Turn) -> List[str]:
    """Return 'skill:<name>' tags for every skill used in the turn itself."""
    names: List[str] = []
    add_skill_tags_from_rows(turn.assistant_msgs, names, "skill:")
    return names


def collect_subagent_skill_tags(
    turn: Turn,
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[str]:
    """Return 'subagent-skill:<name>' tags for skills used inside the
    subagent transcripts launched by this turn.

    Kept in a separate tag namespace so 'skill:' keeps meaning "ran in the
    main conversation" and both dimensions stay filterable independently.
    """
    if not subagent_transcripts_by_tool_use_id:
        return []
    names: List[str] = []
    for assistant_message in turn.assistant_msgs:
        for tool_use in get_tool_use_blocks(get_content_from_row(assistant_message)):
            tool_use_id = str(tool_use.get("id") or "")
            subagent = subagent_transcripts_by_tool_use_id.get(tool_use_id) if tool_use_id else None
            if not isinstance(subagent, dict):
                continue
            path = subagent.get("path")
            if not isinstance(path, Path):
                continue
            rows = read_subagent_jsonl(path)
            if rows:
                add_skill_tags_from_rows(rows, names, "subagent-skill:")
    return names

# Constant on purpose: a shared trace name keeps Langfuse name-based grouping usable.
TRACE_NAME = "Claude Code Turn"

def get_trace_tags(
    turn: Turn,
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[str]:
    tags = ["claude-code"]
    if SKILL_TAGS:
        tags += collect_skill_tags(turn)
        tags += collect_subagent_skill_tags(turn, subagent_transcripts_by_tool_use_id)
    return tags

# ---- Generation payloads ----
def build_generation_input(
    assistant_index: int,
    user_text: str,
    previous_tool_results: List[Dict[str, Any]],
    ready_async_tool_results: List[Dict[str, Any]],
) -> Any:
    if assistant_index == 0:
        return {"role": "user", "content": user_text}
    # Both feed the next generation's context: results from the previous tool
    # batch AND async agent results that became ready since.
    tool_results = list(previous_tool_results)
    tool_results += [result["tool_result"] for result in ready_async_tool_results]
    if tool_results:
        return {"role": "tool", "tool_results": tool_results}
    return None

def build_thinking_parts(content: Any) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
    """Make ChatML thinking parts from the thinking blocks of an assistant message.

    Langfuse renders these parts as thinking blocks. A block without text
    holds no reasoning, so this function skips it.
    """
    parts: List[Dict[str, str]] = []
    metas: List[Dict[str, Any]] = []
    if not isinstance(content, list):
        return parts, metas
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "thinking":
            continue
        thinking_raw = block.get("thinking")
        if not isinstance(thinking_raw, str) or not thinking_raw.strip():
            continue
        thinking_text, thinking_meta = truncate_text(thinking_raw)
        parts.append({"type": "thinking", "content": thinking_text})
        metas.append(thinking_meta)
    return parts, metas

def build_generation_output(assistant_text: str, tool_uses: List[Dict[str, Any]],
                            thinking_parts: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    output: Dict[str, Any] = {"role": "assistant"}
    if assistant_text:
        output["content"] = assistant_text
    if thinking_parts:
        output["thinking"] = thinking_parts
    if tool_uses:
        output["tool_calls"] = [
            {
                "id": tool_use.get("id"),
                "name": tool_use.get("name"),
            }
            for tool_use in tool_uses
        ]
    return output


# ---- Generation input history ----
def build_user_history_content(user_row: Dict[str, Any]) -> Any:
    """The user message for the history: text, plus the images of that turn.

    Each image stays at the position where it entered the conversation, so
    the history shows it the way the model received it.
    """
    user_content = get_content_from_row(user_row)
    user_text, _ = truncate_text(extract_text_from_content(user_content))
    user_media = [
        media for media in (media_from_image_block(block) for block in get_image_blocks(user_content))
        if media is not None
    ]
    return [user_text, *user_media] if user_media else user_text


def build_turn_history_messages(turn: Turn) -> List[Dict[str, Any]]:
    """The ChatML view of one turn, in the shape of the live generation payloads.

    Order: user message, then for each assistant step the generation output
    and one tool message with the step results. An async result appears at
    its launch step with the final output, not at its arrival time.
    """
    messages: List[Dict[str, Any]] = [
        {"role": "user", "content": build_user_history_content(turn.user_msg)}
    ]
    for assistant_message in turn.assistant_msgs:
        assistant_text, _ = truncate_text(
            extract_text_from_content(get_content_from_row(assistant_message))
        )
        tool_uses = get_tool_use_blocks(get_content_from_row(assistant_message))
        messages.append(build_generation_output(assistant_text, tool_uses))
        tool_results: List[Dict[str, Any]] = []
        for tool_use in tool_uses:
            entry = turn.tool_results_by_id.get(str(tool_use.get("id") or ""))
            if entry is None:
                continue
            result = get_tool_result_for_observation(entry)
            output = result.final_output if result.final_output is not None else result.output
            tool_results.append({
                "tool_use_id": tool_use.get("id"),
                "tool_name": tool_use.get("name"),
                "output": output,
            })
        if tool_results:
            messages.append({"role": "tool", "tool_results": tool_results})
    return messages


@dataclass
class SessionHistory:
    """Flat ChatML view of the whole transcript, with one index per turn."""
    messages: List[Dict[str, Any]] = field(default_factory=list)
    start_index_by_user_row_uuid: Dict[str, int] = field(default_factory=dict)

    def prefix_for_turn(self, user_row_uuid: Any) -> Optional[List[Dict[str, Any]]]:
        """All messages before the given turn, or None when the turn is unknown."""
        if not isinstance(user_row_uuid, str) or not user_row_uuid:
            return None
        start_index = self.start_index_by_user_row_uuid.get(user_row_uuid)
        if start_index is None:
            return None
        return self.messages[:start_index]


def build_session_history(
    transcript_path: Path,
    task_id_to_tool_use_id: Optional[Dict[str, str]] = None,
) -> Optional[SessionHistory]:
    """Rebuild the conversation of the whole transcript file as ChatML.

    Reads from byte 0 on purpose: the emission offset only tracks what was
    exported, while a generation input needs every earlier message.
    """
    rows = read_subagent_jsonl(transcript_path)
    if not rows:
        return None
    history = SessionHistory()
    for turn in build_turns(rows, task_id_to_tool_use_id):
        user_row_uuid = turn.user_msg.get("uuid")
        if isinstance(user_row_uuid, str) and user_row_uuid:
            history.start_index_by_user_row_uuid.setdefault(user_row_uuid, len(history.messages))
        history.messages.extend(build_turn_history_messages(turn))
    return history


# ---- Tool observations ----
@dataclass
class ToolResultForObservation:
    output: Any = None
    output_meta: Optional[Dict[str, Any]] = None
    result_timestamp: Optional[datetime] = None
    final_output: Any = None
    final_result_timestamp: Optional[datetime] = None

@dataclass
class EmittedSingleToolObservation:
    handoff_timestamp: Optional[datetime]
    tool_result: Dict[str, Any]
    latest_end_timestamp: Optional[datetime]

@dataclass
class EmittedToolObservationBatch:
    result_timestamps: List[datetime]
    tool_results: List[Dict[str, Any]]
    latest_end_timestamp: Optional[datetime]

def get_tool_input_for_observation(tool_use: Dict[str, Any]) -> Tuple[Any, Optional[Dict[str, Any]]]:
    tool_input_raw = (
        tool_use.get("input")
        if isinstance(tool_use.get("input"), (dict, list, str, int, float, bool))
        else {}
    )
    if isinstance(tool_input_raw, str):
        return truncate_text(tool_input_raw)
    return tool_input_raw, None

def render_tool_result_content(raw: Any) -> Tuple[Any, Optional[Dict[str, Any]]]:
    """Serialize a tool_result content value for an observation payload.

    Image blocks become text markers before json.dumps, so base64 cannot
    use up the truncation budget or hide the text blocks around it. With
    capture on, the media follows the truncated text in a list."""
    if isinstance(raw, str):
        return truncate_text(raw)
    media: List[Any] = []
    if isinstance(raw, list):
        rendered_blocks: List[Any] = []
        for block in raw:
            if isinstance(block, dict) and block.get("type") == "image":
                media_object = media_from_image_block(block)
                if media_object is not None:
                    media.append(media_object)
                rendered_blocks.append({"type": "text", "text": describe_image_block(block)})
            else:
                rendered_blocks.append(block)
        raw = rendered_blocks
    text, meta = truncate_text(json.dumps(raw, ensure_ascii=False))
    if media:
        return [text, *media], meta
    return text, meta

def get_tool_result_for_observation(tool_result_entry: Any) -> ToolResultForObservation:
    if not isinstance(tool_result_entry, dict):
        return ToolResultForObservation()

    output, output_meta = render_tool_result_content(tool_result_entry.get("content"))
    result_timestamp = parse_timestamp(tool_result_entry.get("timestamp"))

    final_output_raw = tool_result_entry.get("final_content")
    if final_output_raw is None:
        return ToolResultForObservation(
            output=output,
            output_meta=output_meta,
            result_timestamp=result_timestamp,
        )

    final_output, _ = render_tool_result_content(final_output_raw)
    final_result_timestamp = parse_timestamp(tool_result_entry.get("final_timestamp"))
    return ToolResultForObservation(
        output=output,
        output_meta=output_meta,
        result_timestamp=result_timestamp,
        final_output=final_output,
        final_result_timestamp=final_result_timestamp,
    )

def get_short_transcript_path_for_metadata(path: Any) -> Optional[str]:
    if isinstance(path, Path):
        return path.name
    if isinstance(path, str) and path:
        return Path(path).name
    return None

def build_tool_metadata(
    tool_name: str,
    tool_use_id: str,
    tool_input_meta: Optional[Dict[str, Any]],
    tool_result: ToolResultForObservation,
    subagent: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    tool_metadata: Dict[str, Any] = {
        "tool_name": tool_name,
        "tool_id": tool_use_id,
        "input_meta": tool_input_meta,
        "output_meta": tool_result.output_meta,
    }
    if subagent:
        tool_metadata.update({
            "subagent_type": subagent.get("agent_type"),
            "subagent_description": subagent.get("description"),
            "subagent_transcript_path": get_short_transcript_path_for_metadata(subagent.get("path")),
        })
    return tool_metadata

@dataclass
class EmissionCursor:
    """Tracks which of a turn's observations were already emitted (namespaced
    keys: gen:/tool:/subagent:/workflow-agent:) so continuation firings only
    emit what is new.

    completed_only skips observations whose emitted form could still change
    (generation awaiting tool results, running async subagent); at turn close
    the cursor runs with completed_only=False so everything remaining ships.
    """
    emitted: set
    completed_only: bool = False
    newly_emitted: List[str] = field(default_factory=list)

    def should_emit(self, key: str, complete: bool = True) -> bool:
        if key in self.emitted:
            return False
        if self.completed_only and not complete:
            return False
        self.emitted.add(key)
        self.newly_emitted.append(key)
        return True


def fresh_cursor() -> EmissionCursor:
    """Cursor for one-shot emission: nothing emitted yet, emit everything."""
    return EmissionCursor(emitted=set(), completed_only=False)


def generation_emission_key(assistant_index: int, assistant_message: Dict[str, Any]) -> str:
    # message.id is the merge unit of assistant rows; the noid fallback is
    # stable because turns are always rebuilt in transcript order.
    return f"gen:{get_message_id(assistant_message) or f'noid:{assistant_index}'}"


def emit_single_tool_observation(
    langfuse: Langfuse,
    parent_otel_span: Any,
    turn: Turn,
    assistant_timestamp: Optional[datetime],
    tool_use: Dict[str, Any],
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]],
    pending_subagents: List[Dict[str, Any]],
    pending_async_tool_results: List[Dict[str, Any]],
    cursor: EmissionCursor,
    tool_key: str,
    workflow_agent_transcripts_by_run_id: Optional[WorkflowAgentTranscriptsByRunId] = None,
) -> EmittedSingleToolObservation:
    tool_use_id = str(tool_use.get("id") or "")
    tool_name = tool_use.get("name") or "unknown"
    tool_input, tool_input_meta = get_tool_input_for_observation(tool_use)

    tool_result_entry = turn.tool_results_by_id.get(tool_use_id) if tool_use_id else None
    tool_result = get_tool_result_for_observation(tool_result_entry)

    tool_output: Any = tool_result.output
    if CAPTURE_SKILL_CONTENT:
        injected = turn.injected_by_tool_id.get(tool_use_id) if tool_use_id else None
        if injected:
            injected_trunc, _ = truncate_text(injected)
            tool_output = {"result": tool_result.output, "injected_instructions": injected_trunc}

    subagent = (
        subagent_transcripts_by_tool_use_id.get(tool_use_id)
        if subagent_transcripts_by_tool_use_id and tool_use_id
        else None
    )
    tool_metadata = build_tool_metadata(tool_name, tool_use_id, tool_input_meta, tool_result, subagent)

    workflow_run_id = (
        tool_result_entry.get("workflow_run_id") if isinstance(tool_result_entry, dict) else None
    )
    workflow_name = (
        tool_result_entry.get("workflow_name") if isinstance(tool_result_entry, dict) else None
    )
    workflow_agents = (
        workflow_agent_transcripts_by_run_id.get(workflow_run_id) or []
        if workflow_agent_transcripts_by_run_id and workflow_run_id
        else []
    )
    if workflow_run_id:
        tool_metadata["workflow_run_id"] = workflow_run_id
        if workflow_name:
            tool_metadata["workflow_name"] = workflow_name
        if workflow_agents:
            tool_metadata["workflow_agent_count"] = len(workflow_agents)

    tool_use_timestamp = parse_timestamp(turn.tool_use_timestamps_by_id.get(tool_use_id)) or assistant_timestamp
    # A tool span's end time comes from its result row, so it only counts as
    # complete once that row exists.
    tool_span = None
    if cursor.should_emit(tool_key, complete=tool_result_entry is not None):
        tool_span = _start_backdated(
            langfuse,
            name=f"Tool: {tool_name}",
            as_type="tool",
            start_time=tool_use_timestamp,
            parent_otel_span=parent_otel_span,
            input=tool_input,
            metadata=tool_metadata,
        )
        tool_span.update(output=tool_output)

    subagent_end_timestamp = None
    if subagent:
        if tool_result.final_result_timestamp is not None:
            pending_subagents.append({
                "tool_use_id": tool_use_id,
                "subagent": subagent,
                "start_timestamp": tool_use_timestamp,
                "ready_timestamp": tool_result.final_result_timestamp,
            })
        else:
            # Without a final result the subagent may still be running: its
            # transcript on disk is not authoritative yet. No tool_result row
            # at all means the tool (sync agents included) is still executing,
            # so completeness must fail closed like the neighboring gates.
            subagent_still_running = tool_result_entry is None or (
                is_async_agent_launch_result(tool_result_entry)
                and (
                    not isinstance(tool_result_entry, dict)
                    or tool_result_entry.get("final_content") is None
                )
            )
            if cursor.should_emit(f"subagent:{tool_use_id or tool_key}", complete=not subagent_still_running):
                subagent_end_timestamp = emit_subagent_observations(
                    langfuse,
                    parent_otel_span,
                    subagent,
                    tool_use_timestamp,
                )

    workflow_end_timestamp = None
    if workflow_agents:
        # Agent transcripts may still grow until the completion
        # notification (final_content) lands.
        workflow_resolved = (
            isinstance(tool_result_entry, dict)
            and tool_result_entry.get("final_content") is not None
        )
        workflow_end_timestamp = emit_workflow_agent_observations(
            langfuse,
            # tool_span is None only when an earlier firing already exported
            # it; late-discovered agents then nest under the turn root instead.
            tool_span._otel_span if tool_span is not None else parent_otel_span,
            workflow_agents,
            workflow_run_id=workflow_run_id,
            workflow_name=workflow_name,
            workflow_resolved=workflow_resolved,
            cursor=cursor,
            emission_scope=tool_use_id or tool_key,
        )

    # Exported spans are immutable, so the end time set here must already
    # cover the workflow agents nested under this span.
    tool_end_timestamp = _get_latest_timestamp(
        tool_result.result_timestamp, tool_use_timestamp, workflow_end_timestamp
    )
    handoff_timestamp = (
        tool_result.result_timestamp
        or tool_result.final_result_timestamp
        or subagent_end_timestamp
        or assistant_timestamp
    )
    if tool_span is not None:
        tool_span.end(end_time=to_otel_nanoseconds(tool_end_timestamp))

    if tool_result.final_result_timestamp is not None and tool_result.final_output is not None:
        pending_async_tool_results.append({
            "timestamp": tool_result.final_result_timestamp,
            "tool_result": {
                "tool_use_id": tool_use_id,
                "tool_name": tool_name,
                "output": tool_result.final_output,
            },
        })

    return EmittedSingleToolObservation(
        handoff_timestamp=handoff_timestamp,
        tool_result={
            "tool_use_id": tool_use_id,
            "tool_name": tool_name,
            "output": tool_result.output,
        },
        latest_end_timestamp=_get_latest_timestamp(
            tool_end_timestamp, subagent_end_timestamp, workflow_end_timestamp
        ),
    )

def emit_tool_observation_batch(
    langfuse: Langfuse,
    parent_otel_span: Any,
    turn: Turn,
    assistant_message: Dict[str, Any],
    assistant_index: int,
    tool_uses: List[Dict[str, Any]],
    subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]],
    pending_subagents: List[Dict[str, Any]],
    pending_async_tool_results: List[Dict[str, Any]],
    cursor: EmissionCursor,
    workflow_agent_transcripts_by_run_id: Optional[WorkflowAgentTranscriptsByRunId] = None,
) -> EmittedToolObservationBatch:
    assistant_timestamp = parse_timestamp(assistant_message)
    generation_key = generation_emission_key(assistant_index, assistant_message)
    tool_result_timestamps: List[datetime] = []
    emitted_tool_results: List[Dict[str, Any]] = []
    latest_tool_end_timestamp: Optional[datetime] = None

    for tool_index, tool_use in enumerate(tool_uses):
        tool_use_id = str(tool_use.get("id") or "")
        tool_key = f"tool:{tool_use_id}" if tool_use_id else f"tool:{generation_key}:{tool_index}"
        emitted_tool = emit_single_tool_observation(
            langfuse,
            parent_otel_span,
            turn,
            assistant_timestamp,
            tool_use,
            subagent_transcripts_by_tool_use_id,
            pending_subagents,
            pending_async_tool_results,
            cursor,
            tool_key,
            workflow_agent_transcripts_by_run_id=workflow_agent_transcripts_by_run_id,
        )
        if emitted_tool.handoff_timestamp is not None:
            tool_result_timestamps.append(emitted_tool.handoff_timestamp)
        emitted_tool_results.append(emitted_tool.tool_result)
        latest_tool_end_timestamp = _get_latest_timestamp(
            latest_tool_end_timestamp,
            emitted_tool.latest_end_timestamp,
        )

    return EmittedToolObservationBatch(
        result_timestamps=tool_result_timestamps,
        tool_results=emitted_tool_results,
        latest_end_timestamp=latest_tool_end_timestamp,
    )

# ---- Turn and subagent observations ----
def get_ready_subagents(
    pending_subagents: List[Dict[str, Any]],
    assistant_timestamp: Optional[datetime],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    ready_subagents: List[Dict[str, Any]] = []
    still_pending_subagents: List[Dict[str, Any]] = []
    for pending_subagent in pending_subagents:
        ready_timestamp = pending_subagent.get("ready_timestamp")
        if isinstance(ready_timestamp, datetime) and (
            assistant_timestamp is None or ready_timestamp <= assistant_timestamp
        ):
            ready_subagents.append(pending_subagent)
        else:
            still_pending_subagents.append(pending_subagent)
    return ready_subagents, still_pending_subagents

def get_ready_async_tool_results(
    pending_async_tool_results: List[Dict[str, Any]],
    assistant_timestamp: Optional[datetime],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Optional[datetime]]:
    ready_async_tool_results: List[Dict[str, Any]] = []
    still_pending_tool_results: List[Dict[str, Any]] = []
    for async_tool_result in pending_async_tool_results:
        async_result_timestamp = async_tool_result.get("timestamp")
        if isinstance(async_result_timestamp, datetime) and (
            assistant_timestamp is None or async_result_timestamp <= assistant_timestamp
        ):
            ready_async_tool_results.append(async_tool_result)
        else:
            still_pending_tool_results.append(async_tool_result)

    latest_ready_timestamp = _get_latest_timestamp(*[
        result.get("timestamp")
        for result in ready_async_tool_results
        if isinstance(result.get("timestamp"), datetime)
    ])
    return ready_async_tool_results, still_pending_tool_results, latest_ready_timestamp

def update_pending_subagent_display_start_after_launch_response(
    pending_subagents: List[Dict[str, Any]],
    tool_results_used_as_generation_input: List[Dict[str, Any]],
    generation_start_timestamp: Optional[datetime],
) -> None:
    if generation_start_timestamp is None:
        return

    tool_use_ids = {
        str(tool_result.get("tool_use_id"))
        for tool_result in tool_results_used_as_generation_input
        if isinstance(tool_result, dict) and tool_result.get("tool_use_id")
    }
    if not tool_use_ids:
        return

    for pending_subagent in pending_subagents:
        if pending_subagent.get("display_start_timestamp") is not None:
            continue
        if pending_subagent.get("tool_use_id") in tool_use_ids:
            pending_subagent["display_start_timestamp"] = generation_start_timestamp + timedelta(
                microseconds=1
            )

def build_generation_kwargs(
    assistant_index: int,
    assistant_message: Dict[str, Any],
    user_text: str,
    previous_tool_results: List[Dict[str, Any]],
    ready_async_tool_results: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    assistant_content = get_content_from_row(assistant_message)
    assistant_text, assistant_text_meta = truncate_text(extract_text_from_content(assistant_content))
    tool_uses = get_tool_use_blocks(assistant_content)
    thinking_parts, thinking_metas = build_thinking_parts(assistant_content)

    speed = get_speed_from_row(assistant_message)

    generation_kwargs: Dict[str, Any] = dict(
        model=get_model(assistant_message),
        input=build_generation_input(
            assistant_index,
            user_text,
            previous_tool_results,
            ready_async_tool_results,
        ),
        output=build_generation_output(assistant_text, tool_uses, thinking_parts),
        metadata={
            "assistant_index": assistant_index,
            "assistant_text": assistant_text_meta,
            "tool_count": len(tool_uses),
        },
    )
    if thinking_metas:
        generation_kwargs["metadata"]["thinking"] = thinking_metas
    if speed is not None:
        generation_kwargs["metadata"]["speed"] = speed
    usage_details = get_usage_details_from_row(assistant_message)
    if usage_details is not None:
        generation_kwargs["usage_details"] = usage_details
    return generation_kwargs, tool_uses

def emit_generation_observation(
    langfuse: Langfuse,
    parent_otel_span: Any,
    generation_name: str,
    start_timestamp: Optional[datetime],
    generation_kwargs: Dict[str, Any],
) -> Any:
    return _start_backdated(
        langfuse,
        name=generation_name,
        as_type="generation",
        start_time=start_timestamp,
        parent_otel_span=parent_otel_span,
        **generation_kwargs,
    )

def emit_turn_observations(langfuse: Langfuse, parent_otel_span: Any, turn: Turn,
                           start_timestamp: Optional[datetime],
                           generation_name: str = "LLM Call",
                           subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
                           cursor: Optional[EmissionCursor] = None,
                           workflow_agent_transcripts_by_run_id: Optional[WorkflowAgentTranscriptsByRunId] = None,
                           history_prefix: Optional[List[Dict[str, Any]]] = None) -> Optional[datetime]:
    """Emit a turn's generations and tool observations under an existing span.

    The full turn is always walked so cross-observation context (generation
    inputs from previous tool results, timestamps) stays correct; the cursor
    only gates which spans are actually created. Without a cursor everything
    is emitted (one-shot behavior).

    With history_prefix set, each generation input is the conversation up to
    that point: the prefix, this turn's user message, and the earlier steps
    of this turn. Callers pass None when the history is not available,
    and the inputs then keep the delta form.
    """
    cursor = cursor if cursor is not None else fresh_cursor()
    user_text, _ = truncate_text(extract_text_from_content(get_content_from_row(turn.user_msg)))
    history_messages: Optional[List[Dict[str, Any]]] = None
    if history_prefix is not None:
        history_messages = list(history_prefix)
        # Same shape as in build_turn_history_messages, so this turn sees its
        # own images the way later turns see them in the history.
        history_messages.append(
            {"role": "user", "content": build_user_history_content(turn.user_msg)}
        )
    previous_timestamp = start_timestamp
    previous_tool_results: List[Dict[str, Any]] = []
    pending_async_tool_results: List[Dict[str, Any]] = []
    pending_subagents: List[Dict[str, Any]] = []
    latest_end_timestamp = start_timestamp
    # True once the walk passed an async launch whose final result is still
    # missing; later generations' inputs can then still change retroactively.
    unresolved_async_launch_seen = False

    def emit_pending_subagent(pending_subagent: Dict[str, Any]) -> None:
        nonlocal latest_end_timestamp
        subagent_key = f"subagent:{pending_subagent.get('tool_use_id')}"
        if not cursor.should_emit(subagent_key, complete=True):
            return
        subagent_end_timestamp = emit_subagent_observations(
            langfuse,
            parent_otel_span,
            pending_subagent["subagent"],
            pending_subagent.get("display_start_timestamp") or pending_subagent.get("start_timestamp"),
        )
        latest_end_timestamp = _get_latest_timestamp(latest_end_timestamp, subagent_end_timestamp)

    for assistant_index, assistant_message in enumerate(turn.assistant_msgs):
        assistant_timestamp = parse_timestamp(assistant_message)
        if assistant_index > 0 and pending_subagents:
            ready_subagents, pending_subagents = get_ready_subagents(
                pending_subagents,
                assistant_timestamp,
            )
            for ready_subagent in ready_subagents:
                emit_pending_subagent(ready_subagent)

        ready_async_tool_results: List[Dict[str, Any]] = []
        if assistant_index > 0 and pending_async_tool_results:
            ready_async_tool_results, pending_async_tool_results, ready_async_result_timestamp = (
                get_ready_async_tool_results(pending_async_tool_results, assistant_timestamp)
            )
            previous_timestamp = _get_latest_timestamp(previous_timestamp, ready_async_result_timestamp)

        if history_messages is not None and ready_async_tool_results:
            history_messages.append({
                "role": "tool",
                "tool_results": [result["tool_result"] for result in ready_async_tool_results],
            })
        generation_kwargs, tool_uses = build_generation_kwargs(
            assistant_index,
            assistant_message,
            user_text,
            previous_tool_results,
            ready_async_tool_results,
        )
        if history_messages is not None:
            generation_kwargs["input"] = list(history_messages)
            generation_kwargs["metadata"]["history"] = {"messages": len(history_messages)}
        generation_start_timestamp = previous_timestamp or assistant_timestamp
        # A generation is only complete when its emitted form cannot change
        # anymore and its tool spans can ship with it: (a) every tool_use of
        # this message has its result (the tool span end), (b) no earlier
        # async launch is unresolved (a late notification would retroactively
        # join this generation's input).
        # The trailing message needs no extra guard: Stop only fires after a
        # response is fully written, and no message.id ever grows across a
        # Stop boundary (0 cases across all local transcripts).
        generation_complete = (
            not unresolved_async_launch_seen
            and all(
                str(tool_use.get("id") or "") in turn.tool_results_by_id
                for tool_use in tool_uses
            )
        )
        generation_span = None
        if cursor.should_emit(
            generation_emission_key(assistant_index, assistant_message),
            complete=generation_complete,
        ):
            generation_span = emit_generation_observation(
                langfuse,
                parent_otel_span=parent_otel_span,
                generation_name=generation_name,
                start_timestamp=generation_start_timestamp,
                generation_kwargs=generation_kwargs,
            )
        update_pending_subagent_display_start_after_launch_response(
            pending_subagents,
            previous_tool_results,
            generation_start_timestamp,
        )

        emitted_tools = emit_tool_observation_batch(
            langfuse,
            parent_otel_span,
            turn,
            assistant_message,
            assistant_index,
            tool_uses,
            subagent_transcripts_by_tool_use_id,
            pending_subagents,
            pending_async_tool_results,
            cursor,
            workflow_agent_transcripts_by_run_id=workflow_agent_transcripts_by_run_id,
        )
        latest_end_timestamp = _get_latest_timestamp(
            latest_end_timestamp,
            emitted_tools.latest_end_timestamp,
        )

        generation_end_timestamp = _get_latest_timestamp(
            assistant_timestamp or previous_timestamp,
            generation_start_timestamp,
        )
        if generation_span is not None:
            generation_span.end(end_time=to_otel_nanoseconds(generation_end_timestamp))
        latest_end_timestamp = _get_latest_timestamp(
            latest_end_timestamp,
            generation_end_timestamp,
            *emitted_tools.result_timestamps,
        )

        for tool_use in tool_uses:
            entry = turn.tool_results_by_id.get(str(tool_use.get("id") or ""))
            if is_async_agent_launch_result(entry) and (
                not isinstance(entry, dict) or entry.get("final_content") is None
            ):
                unresolved_async_launch_seen = True

        if history_messages is not None:
            history_messages.append(generation_kwargs["output"])
            if emitted_tools.tool_results:
                history_messages.append({
                    "role": "tool",
                    "tool_results": emitted_tools.tool_results,
                })

        previous_tool_results = emitted_tools.tool_results
        if emitted_tools.result_timestamps:
            previous_timestamp = max(emitted_tools.result_timestamps)
        elif assistant_timestamp is not None:
            previous_timestamp = assistant_timestamp

    for pending_subagent in pending_subagents:
        emit_pending_subagent(pending_subagent)

    return latest_end_timestamp

def emit_workflow_agent_observations(
    langfuse: Langfuse,
    parent_otel_span: Any,
    workflow_agents: List[Dict[str, Any]],
    *,
    workflow_run_id: str,
    workflow_name: Optional[str],
    workflow_resolved: bool,
    cursor: EmissionCursor,
    emission_scope: str,
) -> Optional[datetime]:
    """Emit each workflow-spawned agent transcript under the launching
    "Tool: Workflow" span.

    Workflow agents carry no toolUseId of their own, so their emission keys
    are derived from the launching tool_use (emission_scope) plus the agent
    id — unique per agent and stable across Stop firings, so the incremental
    EmissionCursor neither duplicates nor starves them.
    """
    workflow_label = workflow_name or workflow_run_id
    latest_end_timestamp: Optional[datetime] = None
    for workflow_agent in workflow_agents:
        agent_id = workflow_agent.get("agent_id")
        if not isinstance(agent_id, str) or not agent_id:
            continue
        if not cursor.should_emit(
            f"workflow-agent:{emission_scope}:{agent_id}", complete=workflow_resolved
        ):
            continue
        extra_metadata: Dict[str, Any] = {
            "workflow_run_id": workflow_run_id,
            "workflow_agent_id": agent_id,
        }
        if workflow_name:
            extra_metadata["workflow_name"] = workflow_name
        agent_result = workflow_agent.get("result")
        agent_result_json: Optional[str] = None
        if agent_result is not None:
            agent_result_json, _ = truncate_text(json.dumps(agent_result, ensure_ascii=False))
            extra_metadata["workflow_agent_result"] = agent_result_json
        agent_end_timestamp = emit_subagent_observations(
            langfuse,
            parent_otel_span,
            workflow_agent,
            # No explicit start: the agent transcript's first row is the real start.
            None,
            span_name=f"Workflow agent: {workflow_label}/{agent_id}",
            extra_metadata=extra_metadata,
            generation_name="LLM Call",
            # Workflow agents typically end on a bare StructuredOutput tool_use
            # (no text in the final message); the journal result is the agent's
            # actual return value, so it becomes the span output instead of "".
            empty_output_fallback=agent_result_json,
        )
        latest_end_timestamp = _get_latest_timestamp(latest_end_timestamp, agent_end_timestamp)
    return latest_end_timestamp

def emit_subagent_observations(langfuse: Langfuse, parent_otel_span: Any,
                               subagent: Dict[str, Any],
                               start_timestamp: Optional[datetime],
                               span_name: Optional[str] = None,
                               extra_metadata: Optional[Dict[str, Any]] = None,
                               generation_name: str = "Subagent LLM Call",
                               empty_output_fallback: Optional[str] = None) -> Optional[datetime]:
    path = subagent.get("path")
    if not isinstance(path, Path):
        return start_timestamp
    rows = read_subagent_jsonl(path)
    if rows is None:
        return start_timestamp

    turns = build_turns(rows)
    if not turns:
        return start_timestamp

    first_turn = turns[0]
    subagent_start_timestamp = start_timestamp or parse_timestamp(first_turn.user_msg)
    subagent_input_text, subagent_input_meta = truncate_text(extract_text_from_content(get_content_from_row(first_turn.user_msg)))

    last_turn = turns[-1]
    last_assistant = last_turn.assistant_msgs[-1]
    subagent_output_text, _ = truncate_text(extract_text_from_content(get_content_from_row(last_assistant)))
    if not subagent_output_text and empty_output_fallback is not None:
        # A final message of only thinking/tool_use blocks extracts no text;
        # callers with a better source (workflow journal result) supply it here.
        # Classic subagents pass no fallback, keeping their behavior unchanged.
        subagent_output_text = empty_output_fallback

    description = subagent.get("description")
    if span_name is None:
        span_name = f"Subagent: {description}" if isinstance(description, str) and description else "Subagent"
    subagent_metadata: Dict[str, Any] = {
        "agent_type": subagent.get("agent_type"),
        "description": description,
        "transcript_path": get_short_transcript_path_for_metadata(path),
        "user_text": subagent_input_meta,
    }
    if extra_metadata:
        subagent_metadata.update(extra_metadata)
    subagent_span = _start_backdated(
        langfuse,
        name=span_name,
        as_type="span",
        start_time=subagent_start_timestamp,
        parent_otel_span=parent_otel_span,
        input={"role": "user", "content": subagent_input_text},
        metadata=subagent_metadata,
    )

    latest_end_timestamp = subagent_start_timestamp
    previous_start_timestamp = subagent_start_timestamp
    # The agent transcript is complete on disk, so history accumulates
    # across its turns the same way as in the main conversation.
    subagent_history: List[Dict[str, Any]] = []
    for turn in turns:
        latest_turn_timestamp = emit_turn_observations(
            langfuse,
            subagent_span._otel_span,
            turn,
            previous_start_timestamp,
            generation_name=generation_name,
            subagent_transcripts_by_tool_use_id=None,
            history_prefix=list(subagent_history),
        )
        subagent_history.extend(build_turn_history_messages(turn))
        latest_end_timestamp = _get_latest_timestamp(latest_end_timestamp, latest_turn_timestamp)
        if latest_turn_timestamp is not None:
            previous_start_timestamp = latest_turn_timestamp

    subagent_span.update(output={"role": "assistant", "content": subagent_output_text})
    subagent_span.end(
        end_time=to_otel_nanoseconds(
            _get_latest_timestamp(latest_end_timestamp, subagent_start_timestamp)
        )
    )

    return latest_end_timestamp

def read_subagent_jsonl(path: Path) -> Optional[List[Dict[str, Any]]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except Exception as e:
        info(f"transcript read failed ({path}): {type(e).__name__}: {e}")
        return None

    rows: List[Dict[str, Any]] = []
    for line_number, line in enumerate(lines, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception as e:
            info(f"transcript line skipped ({path}:{line_number}): {type(e).__name__}: {e}")
            continue
        if not isinstance(row, dict):
            info(f"transcript line skipped ({path}:{line_number}): expected JSON object")
            continue
        rows.append(row)
    return rows

def get_turn_end_timestamp(turn: Turn) -> Optional[datetime]:
    last_assistant_timestamp = parse_timestamp(turn.assistant_msgs[-1]) if turn.assistant_msgs else None
    candidate_end_timestamps = [
        timestamp
        for timestamp in [last_assistant_timestamp]
        if timestamp is not None
    ]
    for tool_result_entry in turn.tool_results_by_id.values():
        timestamp = parse_timestamp(tool_result_entry)
        if timestamp is not None:
            candidate_end_timestamps.append(timestamp)
    return max(candidate_end_timestamps) if candidate_end_timestamps else None

def build_trace_metadata(
    session_id: str,
    turn_num: int,
    turn: Turn,
    transcript_path: Path,
    user_text_meta: Dict[str, Any],
) -> Dict[str, Any]:
    trace_metadata: Dict[str, Any] = {
        "source": "claude-code",
        "session_id": session_id,
        "turn_number": turn_num,
        "transcript_path": get_short_transcript_path_for_metadata(transcript_path),
        "user_text": user_text_meta,
        "assistant_message_count": len(turn.assistant_msgs),
    }
    # Transcript rows carry the project dir and git branch so traces from
    # different projects/worktrees are distinguishable in Langfuse.
    for src_key, dst_key in (("cwd", "cwd"), ("gitBranch", "git_branch")):
        value = turn.user_msg.get(src_key)
        if isinstance(value, str) and value:
            trace_metadata[dst_key] = value
    return trace_metadata

def is_valid_span_id_hex(span_id: Any) -> bool:
    return (
        isinstance(span_id, str)
        and len(span_id) == 16
        and all(c in "0123456789abcdef" for c in span_id)
    )


def remote_parent(langfuse: Langfuse, session_id: str, user_row_uuid: Any,
                  root_span_id: Optional[str] = None,
                  trace_id: Optional[str] = None) -> Optional[Any]:
    """Return a carrier span pinning the turn's trace id, seeded from session
    id + the turn's user-row uuid.

    Without root_span_id the carrier gets a phantom span id: it is never
    exported, OTel merely requires a valid non-zero id, and children become
    the trace's roots. With root_span_id (the 16-hex observation id of a
    root span opened by an earlier firing) children nest under that span
    instead, so continuation firings can extend an already-emitted turn.

    trace_id (32-hex) overrides the seeded derivation: continuation firings
    pass the id stored at root creation so a turn never switches trace
    mid-flight (e.g. when its root was opened under a
    CC_LANGFUSE_TRACE_SEED-forced id).
    """
    if not isinstance(user_row_uuid, str) or not user_row_uuid:
        return None
    if root_span_id is not None and not is_valid_span_id_hex(root_span_id):
        # A corrupt stored span id must not cost the deterministic trace id:
        # degrade to the phantom-parent path instead of the except fallback.
        debug(f"remote_parent: ignoring malformed root_span_id {root_span_id!r}")
        root_span_id = None
    if trace_id is not None and not _is_valid_trace_id_hex(trace_id):
        debug(f"remote_parent: ignoring malformed trace_id {trace_id!r}")
        trace_id = None
    try:
        if trace_id is None:
            trace_id = langfuse.create_trace_id(seed=f"{session_id}:{user_row_uuid}")
        parent_context = otel_trace_api.SpanContext(
            trace_id=int(trace_id, 16),
            span_id=int(root_span_id, 16) if root_span_id else (random.getrandbits(64) or 1),
            trace_flags=otel_trace_api.TraceFlags(0x01),  # sampled
            is_remote=False,
        )
        return otel_trace_api.NonRecordingSpan(parent_context)
    except Exception as e:
        debug(f"remote_parent failed, falling back to random trace id: {e}")
        return None


def open_turn_root_span(langfuse: Langfuse, session_id: str, turn_num: int, turn: Turn,
                        transcript_path: Path, trace_seed: Optional[str] = None,
                        parent_context: Optional[Tuple[str, str]] = None) -> Any:
    """Open the turn's root span, backdated to the user message.

    The root exports exactly once, at the first firing that is allowed to
    emit the turn (async activity resolved, or turn closed); later firings
    only attach children under it via the remote-parent carrier.

    With parent_context set (attached mode: an externally provided
    trace id + span id), the turn joins the launching application's trace
    and nests under that span — the application owns the trace root, so no
    as_root marker is set. Otherwise, with trace_seed set
    (CC_LANGFUSE_TRACE_SEED) the root adopts the externally precomputable
    trace id derived from seed and turn number; otherwise the
    session:user-row-uuid carrier pins the trace id.
    """
    _, user_text_meta = truncate_text(extract_text_from_content(get_content_from_row(turn.user_msg)))
    # The root keeps this turn's question only, so the trace list stays
    # scannable; the conversation history lives on the LLM call inputs.
    root_input = {"role": "user", "content": build_user_history_content(turn.user_msg)}
    trace_metadata = build_trace_metadata(session_id, turn_num, turn, transcript_path, user_text_meta)
    if parent_context is not None:
        parent_trace_id, parent_span_id = parent_context
        trace_metadata["parent_trace_id"] = parent_trace_id
        trace_metadata["parent_span_id"] = parent_span_id
        return _start_backdated(
            langfuse,
            name="Conversational Turn",
            as_type="span",
            start_time=parse_timestamp(turn.user_msg),
            forced_trace_id=parent_trace_id,
            forced_parent_span_id=parent_span_id,
            as_root=False,
            input=root_input,
            metadata=trace_metadata,
        )
    # Opt-in deterministic trace ids: fail open to the carrier-derived id.
    forced_trace_id: Optional[str] = None
    if trace_seed:
        try:
            forced_trace_id = derive_turn_trace_id(trace_seed, turn_num)
        except Exception as e:
            debug(f"trace id derivation failed for turn {turn_num}: {e}")
    return _start_backdated(
        langfuse,
        name="Conversational Turn",
        as_type="span",
        start_time=parse_timestamp(turn.user_msg),
        parent_otel_span=None if forced_trace_id else remote_parent(langfuse, session_id, turn.user_msg.get("uuid")),
        forced_trace_id=forced_trace_id,
        as_root=True,
        input=root_input,
        metadata=trace_metadata,
    )



def build_turn_output_payload(turn: Turn) -> Dict[str, Any]:
    last_assistant = turn.assistant_msgs[-1]
    text, _ = truncate_text(extract_text_from_content(get_content_from_row(last_assistant)))
    return {"role": "assistant", "content": text}


def get_root_span_end_time(turn: Turn, obs_end_ts: Optional[datetime]) -> Optional[datetime]:
    return _get_latest_timestamp(
        get_turn_end_timestamp(turn),
        parse_timestamp(turn.assistant_msgs[-1]),
        obs_end_ts,
        parse_timestamp(turn.user_msg),
    )


def emit_turn(langfuse: Langfuse, session_id: str, turn_num: int,
              turn: Turn, transcript_path: Path,
              user_id: Optional[str] = None,
              subagent_transcripts_by_tool_use_id: Optional[Dict[str, Dict[str, Any]]] = None,
              progress: Optional[Dict[str, Any]] = None,
              close: bool = True,
              trace_seed: Optional[str] = None,
              parent_context: Optional[Tuple[str, str]] = None,
              workflow_agent_transcripts_by_run_id: Optional[WorkflowAgentTranscriptsByRunId] = None,
              history_prefix: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Emit a turn, resuming from prior firings' progress.

    With no progress and close=True this is the classic one-shot emission.
    With close=False only ready observations ship (those whose emitted form
    can no longer change); a later firing resumes from the returned progress
    (root span id + emitted keys) and adds what is still missing.

    The root span exports exactly once, carrying the output/end time known
    at that moment — exported spans are immutable, so callers must not emit
    a turn whose root fields can provably still change (see
    turn_has_unresolved_async_activity).
    """
    progress = dict(progress or {})
    cursor = EmissionCursor(
        emitted=set(k for k in (progress.get("emitted_keys") or []) if isinstance(k, str)),
        completed_only=not close,
    )
    if parent_context is None:
        attribute_propagation = propagate_attributes(
            session_id=session_id,
            user_id=user_id,
            trace_name=TRACE_NAME,
            tags=get_trace_tags(turn, subagent_transcripts_by_tool_use_id),
        )
    else:
        # Attached mode: trace name, session, user and tags are trace-level
        # fields owned by the launching application's trace — propagating
        # them would overwrite the application's own values server-side.
        attribute_propagation = contextlib.nullcontext()
    with attribute_propagation:
        trace_span = None
        root_span_id = progress.get("root_span_id")
        if not is_valid_span_id_hex(root_span_id):
            trace_span = open_turn_root_span(
                langfuse, session_id, turn_num, turn, transcript_path,
                trace_seed=trace_seed, parent_context=parent_context,
            )
            root_span_id = getattr(trace_span, "id", None)
            progress["root_span_id"] = root_span_id
            progress["trace_id"] = getattr(trace_span, "trace_id", None)
            parent_otel_span = trace_span._otel_span
        else:
            # Root span exported by an earlier firing: attach children to it
            # via a carrier. The stored trace id wins over re-derivation so
            # seeded and attached turns resume into the same trace.
            parent_otel_span = remote_parent(
                langfuse, session_id, turn.user_msg.get("uuid"),
                root_span_id=root_span_id,
                trace_id=progress.get("trace_id") or (parent_context[0] if parent_context else None),
            )
        obs_end_ts = emit_turn_observations(
            langfuse,
            parent_otel_span,
            turn,
            parse_timestamp(turn.user_msg),
            subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
            cursor=cursor,
            workflow_agent_transcripts_by_run_id=workflow_agent_transcripts_by_run_id,
            history_prefix=history_prefix,
        )
        if trace_span is not None:
            # The root exports exactly once: end time and output are the
            # values known now, and stay — exported fields are immutable.
            trace_span.update(output=build_turn_output_payload(turn))
            trace_span.end(
                end_time=to_otel_nanoseconds(get_root_span_end_time(turn, obs_end_ts))
            )
    progress["emitted_keys"] = sorted(cursor.emitted)
    return progress


# ---- New turn emission orchestration ----
def pop_turn_progress(session_state: SessionState, turn: Turn) -> Optional[Dict[str, Any]]:
    user_row_uuid = turn.user_msg.get("uuid")
    if not isinstance(user_row_uuid, str) or not user_row_uuid:
        return None
    entry = session_state.turn_progress.pop(user_row_uuid, None)
    return entry if isinstance(entry, dict) else None


def emit_and_close_ready_turns(
    langfuse: Langfuse,
    session_id: str,
    transcript_path: Path,
    turns_to_emit: List[Turn],
    session_state: SessionState,
    *,
    user_id: Optional[str],
    subagent_transcripts_by_tool_use_id: Dict[str, Dict[str, Any]],
    trace_seed: Optional[str] = None,
    parent_context: Optional[Tuple[str, str]] = None,
    workflow_agent_transcripts_by_run_id: Optional[WorkflowAgentTranscriptsByRunId] = None,
    session_history: Optional[SessionHistory] = None,
) -> int:
    emitted = 0
    # Turns without a user-row uuid bypass assign_turn_numbers; seed their
    # fallback from the same monotonic sequence so numbers never collide.
    next_fallback_turn_number = 1 + max(
        session_state.turn_count,
        max(session_state.turn_numbers.values(), default=0),
    )
    for turn in turns_to_emit:
        emitted += 1
        turn_num = session_state.turn_numbers.get(turn.user_msg.get("uuid"))
        if turn_num is None:
            turn_num = next_fallback_turn_number
            next_fallback_turn_number += 1
        # Progress from firings while this turn was still open; closing the
        # turn consumes it so the emitted keys don't outlive the turn.
        progress = pop_turn_progress(session_state, turn)
        try:
            emit_turn(
                langfuse,
                session_id,
                turn_num,
                turn,
                transcript_path,
                user_id=user_id,
                subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
                progress=progress,
                close=True,
                trace_seed=trace_seed,
                parent_context=parent_context,
                workflow_agent_transcripts_by_run_id=workflow_agent_transcripts_by_run_id,
                history_prefix=(
                    session_history.prefix_for_turn(turn.user_msg.get("uuid"))
                    if session_history is not None
                    else None
                ),
            )
        except Exception as e:
            # Log at INFO so SDK incompatibilities (and other emit failures)
            # are visible without needing CC_LANGFUSE_DEBUG=true.
            info(f"emit_turn failed: {type(e).__name__}: {e}")
    return emitted


def emit_ready_observations_of_open_turn(
    langfuse: Langfuse,
    session_id: str,
    transcript_path: Path,
    session_state: SessionState,
    task_id_to_tool_use_id: Dict[str, str],
    *,
    user_id: Optional[str],
    subagent_transcripts_by_tool_use_id: Dict[str, Dict[str, Any]],
    trace_seed: Optional[str] = None,
    parent_context: Optional[Tuple[str, str]] = None,
    workflow_agent_transcripts_by_run_id: Optional[WorkflowAgentTranscriptsByRunId] = None,
    session_history: Optional[SessionHistory] = None,
) -> None:
    """Emit the held open turn once its async activity is provably resolved.

    Agent-less turns pass the gate at their own Stop and ship immediately;
    turns with async activity ship at the first Stop after every agent
    result has been delivered (empirically: the Stop right after Claude's
    summary). The turn keeps being held either way; only its emission
    progress advances in session_state.turn_progress. Exported roots are
    final — if a turn grows after a clean Stop, later firings still add
    children, but the root's output/end time stay as emitted.
    """
    held_rows = session_state.open_turn.get("rows") if isinstance(session_state.open_turn, dict) else None
    if not isinstance(held_rows, list) or not held_rows:
        return
    _, trailing_turn, _ = assemble_turns(held_rows, task_id_to_tool_use_id)
    if trailing_turn is None:
        return
    if turn_has_unresolved_async_activity(trailing_turn):
        # The turn provably continues (pending agent result or queued,
        # undelivered notification). Emitting now would freeze a wrong root
        # output forever; everything ships at the first clean Stop instead.
        debug("Open turn held: async activity unresolved (pending agent or undelivered notification)")
        return
    user_row_uuid = trailing_turn.user_msg.get("uuid")
    if not isinstance(user_row_uuid, str) or not user_row_uuid:
        return
    turn_num = session_state.turn_numbers.get(user_row_uuid)
    if turn_num is None:
        return
    progress = session_state.turn_progress.get(user_row_uuid)
    try:
        progress = emit_turn(
            langfuse,
            session_id,
            turn_num,
            trailing_turn,
            transcript_path,
            user_id=user_id,
            subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
            progress=progress if isinstance(progress, dict) else None,
            close=False,
            trace_seed=trace_seed,
            parent_context=parent_context,
            workflow_agent_transcripts_by_run_id=workflow_agent_transcripts_by_run_id,
            history_prefix=(
                session_history.prefix_for_turn(user_row_uuid)
                if session_history is not None
                else None
            ),
        )
        session_state.turn_progress[user_row_uuid] = progress
    except Exception as e:
        info(f"emitting ready observations of open turn failed: {type(e).__name__}: {e}")

def emit_new_turns_from_transcript(
    langfuse: Langfuse,
    config: LangfuseConfig,
    session_id: str,
    transcript_path: Path,
    *,
    flush_deferred_agent_turns: bool = False,
) -> int:
    with FileLock(LOCK_FILE):
        state = load_hook_state()
        key = get_session_state_key(session_id, str(transcript_path))
        session_state = get_session_state(state, key)

        subagent_transcripts_by_tool_use_id = get_subagent_transcripts_by_tool_use_id(transcript_path)
        if subagent_transcripts_by_tool_use_id:
            debug(f"Discovered {len(subagent_transcripts_by_tool_use_id)} subagent transcript(s)")

        workflow_agent_transcripts_by_run_id = WorkflowAgentTranscriptsByRunId(transcript_path)

        turns, session_state = get_new_turns_from_transcript(
            transcript_path,
            session_state,
            subagent_transcripts_by_tool_use_id,
            flush_deferred_agent_turns=flush_deferred_agent_turns,
        )

        # One full-file pass per firing serves every turn emitted below.
        session_history = None
        if turns or session_state.open_turn:
            session_history = build_session_history(
                transcript_path,
                get_task_id_to_tool_use_id(subagent_transcripts_by_tool_use_id),
            )

        emitted = 0
        if turns:
            turns_to_emit = get_turns_to_emit(
                turns,
                session_state,
                flush_deferred_agent_turns=flush_deferred_agent_turns,
            )
            emitted = emit_and_close_ready_turns(
                langfuse,
                session_id,
                transcript_path,
                turns_to_emit,
                session_state,
                user_id=config.user_id,
                subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
                trace_seed=config.trace_seed,
                parent_context=config.parent_context,
                workflow_agent_transcripts_by_run_id=workflow_agent_transcripts_by_run_id,
                session_history=session_history,
            )

        session_state.turn_count += emitted

        # The still-open trailing turn ships once its async activity is
        # provably resolved (agent-less turns: at their own Stop); until
        # then its rows keep being held and nothing is emitted.
        emit_ready_observations_of_open_turn(
            langfuse,
            session_id,
            transcript_path,
            session_state,
            get_task_id_to_tool_use_id(subagent_transcripts_by_tool_use_id),
            user_id=config.user_id,
            subagent_transcripts_by_tool_use_id=subagent_transcripts_by_tool_use_id,
            trace_seed=config.trace_seed,
            parent_context=config.parent_context,
            workflow_agent_transcripts_by_run_id=workflow_agent_transcripts_by_run_id,
            session_history=session_history,
        )

        # Known limitation (accepted, like the crash-between-emit-and-save
        # duplicate window): progress is persisted before the SDK flush in
        # main(); a dropped flush leaves emitted_keys pointing at spans that
        # never reached the server.
        save_session_state(state, key, session_state)

    return emitted


def flush_and_shutdown_langfuse_client(langfuse: Optional[Langfuse]) -> None:
    if langfuse is None:
        return

    # Cap flush+shutdown at 5s so a slow/unreachable Langfuse can't stall Claude Code.
    try:
        def _flush_and_shutdown():
            try:
                langfuse.flush()
            except Exception:
                pass
            langfuse.shutdown()

        t = threading.Thread(target=_flush_and_shutdown, daemon=True)
        t.start()
        t.join(5.0)
    except Exception:
        pass


# ----------------- Main -----------------
def main() -> int:
    start = time.time()
    debug("Hook started")

    if _STATE_DIR_WARNING:
        info(_STATE_DIR_WARNING)

    config = get_langfuse_config()
    if config is None:
        log_missing_langfuse_config()
        return 0

    payload = read_hook_payload()
    hook_context = get_session_id_and_transcript_path(payload)
    if hook_context is None:
        return 0

    session_id, transcript_path = hook_context
    flush_deferred_agent_turns = is_session_end_hook_payload(payload)

    langfuse = create_langfuse_client(config)
    if langfuse is None:
        return 0

    try:
        emitted = emit_new_turns_from_transcript(
            langfuse,
            config,
            session_id,
            transcript_path,
            flush_deferred_agent_turns=flush_deferred_agent_turns,
        )

        dur = time.time() - start
        info(f"Processed {emitted} turns in {dur:.2f}s (session={session_id})")
        return 0

    except TimeoutError as e:
        debug(f"lock timeout, skipping: {e}")
        return 0

    except Exception as e:
        debug(f"Unexpected failure: {e}")
        return 0

    finally:
        flush_and_shutdown_langfuse_client(langfuse)

if __name__ == "__main__":
    sys.exit(main())
