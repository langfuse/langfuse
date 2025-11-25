import fs from "node:fs/promises";

import { prisma, Prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import Decimal from "decimal.js";

const EXPORT_PATH = `${__dirname}/../constants/default-model-prices.json`;

export async function getDefaultModelPrices() {
  const modelPricesFromDb = await prisma.$queryRaw<
    {
      id: string;
      model_name: string;
      match_pattern: string;
      input_price: Decimal | null;
      output_price: Decimal | null;
      total_price: Decimal | null;
      created_at: Date | null;
      updated_at: Date | null;
      tokenizer_config: Prisma.JsonValue | null;
      tokenizer_id: string | null;
    }[]
  >`
    SELECT DISTINCT ON (model_name)
      id,
      model_name,
      match_pattern,
      input_price,
      output_price,
      total_price,
      created_at,
      updated_at,
      tokenizer_config,
      tokenizer_id
    FROM
      models
    WHERE
      project_id IS NULL
    ORDER BY
      model_name,
      start_date DESC NULLS LAST;
  `;

  return modelPricesFromDb
    .map((modelPrice) => {
      return {
        id: modelPrice.id,
        model_name: modelPrice.model_name,
        match_pattern: modelPrice.match_pattern,
        created_at: modelPrice.created_at,
        updated_at: modelPrice.updated_at,
        prices: {
          input: modelPrice.input_price?.toNumber(),
          output: modelPrice.output_price?.toNumber(),
          total: modelPrice.total_price?.toNumber(),
        },
        tokenizer_config: modelPrice.tokenizer_config,
        tokenizer_id: modelPrice.tokenizer_id,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
  try {
    const modelPrices = await getDefaultModelPrices();

    await fs.writeFile(EXPORT_PATH, JSON.stringify(modelPrices, null, 2));

    console.log(
      `✅ ${modelPrices.length} default model prices written to ${EXPORT_PATH}.`,
    );
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
    redis?.disconnect();
  }
}

main().then(() => {
  console.log("Done");
});
