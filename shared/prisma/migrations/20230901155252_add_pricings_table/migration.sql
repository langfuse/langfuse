-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('PER_1000_TOKENS');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('PROMPT', 'COMPLETION', 'TOTAL');

-- CreateTable
CREATE TABLE "pricings" (
    "id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "pricing_unit" "PricingUnit" NOT NULL DEFAULT 'PER_1000_TOKENS',
    "price" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "token_type" "TokenType" NOT NULL,

    CONSTRAINT "pricings_pkey" PRIMARY KEY ("id")
);
