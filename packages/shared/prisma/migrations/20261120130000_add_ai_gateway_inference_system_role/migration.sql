-- Add the invoke-only system role for AI Gateway API keys in its own migration
-- because PostgreSQL forbids using a newly added enum value in the same transaction.
ALTER TYPE "SystemRole" ADD VALUE IF NOT EXISTS 'AI_GATEWAY_INFERENCE';
