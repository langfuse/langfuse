UPDATE "gateway_guardrails"
SET "action" = 'ENFORCE'
WHERE "type" = 'BEDROCK' AND "action" IN ('BLOCK', 'REDACT');
