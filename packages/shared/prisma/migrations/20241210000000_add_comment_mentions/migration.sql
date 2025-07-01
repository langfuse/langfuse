-- Add mentioned user IDs column to comments table
ALTER TABLE "comments" ADD COLUMN "mentioned_user_ids" JSONB DEFAULT '[]'::jsonb;

-- Create index for efficient queries on mentioned users
CREATE INDEX "comments_mentioned_user_ids_idx" ON "comments" USING GIN ("mentioned_user_ids");