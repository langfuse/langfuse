-- CreateIndex
CREATE INDEX CONCURRENTLY "comment_reactions_user_id_idx" ON "comment_reactions"("user_id");
