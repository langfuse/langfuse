-- CreateIndex
CREATE UNIQUE INDEX CONCURRENTLY "comment_reactions_comment_id_user_id_emoji_key" ON "comment_reactions"("comment_id", "user_id", "emoji");