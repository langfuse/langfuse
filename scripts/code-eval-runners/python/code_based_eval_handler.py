import asyncio
import dataclasses
import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ObservationContext:
    input: Any = None
    output: Any = None
    metadata: Any = None


@dataclass
class ExperimentContext:
    item_expected_output: Any = None
    item_metadata: Any = None


@dataclass
class EvaluationContext:
    observation: ObservationContext
    experiment: ExperimentContext | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]):
        observation = payload.get("observation") or {}
        experiment = payload.get("experiment")
        return cls(
            observation=ObservationContext(
                input=observation.get("input"),
                output=observation.get("output"),
                metadata=observation.get("metadata"),
            ),
            experiment=ExperimentContext(
                item_expected_output=experiment.get("itemExpectedOutput"),
                item_metadata=experiment.get("itemMetadata"),
            )
            if isinstance(experiment, dict)
            else None,
        )


# Public dataclasses exposed to user evaluator code. Field names are Pythonic
# (snake_case); they are translated to the camelCase wire format (`dataType`,
# `configId`) by `to_jsonable` so users can return an `EvaluationResult`
# directly without manual key mangling.
@dataclass
class Score:
    value: int | float | str | bool
    name: str
    data_type: str | None = None
    comment: str | None = None
    config_id: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass
class EvaluationResult:
    scores: list[Score] = field(default_factory=list)


# Mapping from dataclass snake_case field names to the camelCase keys expected
# by the dispatcher wire schema. Kept as an explicit allowlist so that user
# metadata payloads (which may legitimately contain snake_case keys) are never
# rewritten — only dataclass field names are translated.
_DATACLASS_FIELD_NAME_OVERRIDES: dict[str, str] = {
    "data_type": "dataType",
    "config_id": "configId",
}


def handler(event, context):
    namespace = {
        "EvaluationContext": EvaluationContext,
        "EvaluationResult": EvaluationResult,
        "Score": Score,
    }

    try:
        exec(event["code"]["source"], namespace)
    except Exception as error:
        return runner_error(
            "INVALID_SOURCE", f"Failed to load evaluator source: {error}"
        )

    evaluate = namespace.get("evaluate")
    if not callable(evaluate):
        return runner_error(
            "INVALID_SOURCE", "Evaluator source must define an evaluate(ctx) function"
        )

    try:
        result = evaluate(EvaluationContext.from_payload(event.get("payload", {})))
        if asyncio.iscoroutine(result):
            result = asyncio.run(result)
    except Exception as error:
        return runner_error("USER_CODE_ERROR", str(error))

    return normalize_result(result)


def normalize_result(result):
    normalized = to_jsonable(result)

    if not isinstance(normalized, dict) or not isinstance(
        normalized.get("scores"), list
    ):
        return runner_error(
            "INVALID_RESULT",
            "Evaluator must return an object shaped like { scores: [...] }",
        )

    return normalized


def to_jsonable(value):
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        # Translate snake_case dataclass field names to the camelCase wire
        # format and drop None-valued optional fields so that the result
        # matches the union variants in the TypeScript schema (e.g. the
        # `dataType: undefined` variant).
        result = {}
        for f in dataclasses.fields(value):
            raw = getattr(value, f.name)
            if raw is None:
                continue
            key = _DATACLASS_FIELD_NAME_OVERRIDES.get(f.name, f.name)
            result[key] = to_jsonable(raw)
        if (
            isinstance(value, Score)
            and "dataType" not in result
            and isinstance(value.value, bool)
        ):
            result["dataType"] = "BOOLEAN"
        return result

    if isinstance(value, list):
        return [to_jsonable(item) for item in value]

    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}

    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def runner_error(code: str, message: str):
    return {"error": {"code": code, "message": message}}
