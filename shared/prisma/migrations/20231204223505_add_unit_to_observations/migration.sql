-- AlterTable
-- Adding this migration does not lock the postgres table. For non volaitile data, the default value is stored in the 
-- table metadata and accessed on read query time. No table re-write is required (https://www.postgresql.org/docs/current/sql-altertable.html#:~:text=When%20a%20column%20is%20added,is%20specified%2C%20NULL%20is%20used.)
ALTER TABLE "observations" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'TOKENS';