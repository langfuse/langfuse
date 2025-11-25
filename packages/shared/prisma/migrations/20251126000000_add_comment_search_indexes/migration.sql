-- Full-text search index for comment content filtering
-- This enables efficient text search queries on comment content
-- Uses PostgreSQL's built-in full-text search with GIN index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_content_gin
ON comments USING gin(to_tsvector('english', content));
