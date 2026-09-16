"""Regenerate with Langfuse 4.15.0 and opentelemetry-api/sdk 1.40.0 installed."""

import importlib.metadata
import json
import platform
from pathlib import Path

from langfuse import propagate_attributes
from opentelemetry.baggage.propagation import W3CBaggagePropagator
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags, TraceState, use_span
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

inputs = {
    'user_id': 'user+name / snow雪',
    'session_id': 'session_with_underscore + value',
    'trace_name': 'Gateway "quoted" workflow / 雪',
    'tags': ['plain', 'comma,tag', 'double"quote', "single'quote", 'both\'"quotes', 'space tag', 'plus+tag', 'snow雪', '雪', 'back\\slash'],
    'metadata': {'team_name': 'search+ranking', 'request_note_with_underscores': 'snow雪 / 雪 + value', 'numeric_value': 42, 'boolean_value': True},
}
propagator = CompositePropagator([TraceContextTextMapPropagator(), W3CBaggagePropagator()])
span_context = SpanContext(
    trace_id=int('0123456789abcdef0123456789abcdef', 16),
    span_id=int('0123456789abcdef', 16),
    is_remote=False,
    trace_flags=TraceFlags(TraceFlags.SAMPLED),
    trace_state=TraceState([('vendor', 'opaque-state')]),
)
carrier = {}
with use_span(NonRecordingSpan(span_context)):
    with propagate_attributes(**inputs, as_baggage=True):
        propagator.inject(carrier)
result = {
    'python': platform.python_version(),
    'versions': {p: importlib.metadata.version(p) for p in ['langfuse', 'opentelemetry-api', 'opentelemetry-sdk']},
    'inputs': inputs,
    'carrier': carrier,
}
output = json.dumps(result, ensure_ascii=False, indent=2)
Path(__file__).with_suffix('.json').write_text(output + '\n')
print(output)
