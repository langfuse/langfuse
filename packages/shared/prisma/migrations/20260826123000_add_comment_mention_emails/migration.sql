-- Durable idempotency for comment-mention emails.
-- Unique (comment_id, user_id) so BullMQ redeliveries do not send twice
-- when Redis is unavailable or a sent marker write fails.
CREATE TABLE "comment_mention_emails" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_mention_emails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "comment_mention_emails_comment_id_user_id_key" ON "comment_mention_emails"("comment_id", "user_id");

ALTER TABLE "comment_mention_emails" ADD CONSTRAINT "comment_mention_emails_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "comment_mention_emails" ADD CONSTRAINT "comment_mention_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
