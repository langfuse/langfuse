-- Due to the unique constraint on the email column, we need to make sure that all emails are in lowercase.
-- This migration will update all existing emails to be lowercase.
-- This migration fails if there are duplicate emails in the database.

UPDATE "users" SET "email" = LOWER("email");
