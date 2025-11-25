-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ObservationType" ADD VALUE 'AGENT';
ALTER TYPE "ObservationType" ADD VALUE 'TOOL';
ALTER TYPE "ObservationType" ADD VALUE 'CHAIN';
ALTER TYPE "ObservationType" ADD VALUE 'RETRIEVER';
ALTER TYPE "ObservationType" ADD VALUE 'EVALUATOR';
ALTER TYPE "ObservationType" ADD VALUE 'EMBEDDING';
ALTER TYPE "ObservationType" ADD VALUE 'GUARDRAIL';
