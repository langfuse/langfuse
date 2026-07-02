ALTER TABLE "organizations"
ADD COLUMN "cross_project_trace_correlation_key" TEXT NOT NULL DEFAULT 'crossProjectCorrelationId';
