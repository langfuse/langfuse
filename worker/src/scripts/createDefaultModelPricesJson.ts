import fs from "node:fs/promises";

import { prisma } from "@langfuse/shared/src/db";
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
    }[]
  >`
    SELECT DISTINCT ON (model_name)
      id,
      model_name,
      match_pattern,
      input_price,
      output_price,
      total_price
    FROM
      models
    WHERE
      project_id IS NULL
    ORDER BY
      model_name,
      start_date DESC NULLS LAST;
  `;

  return modelPricesFromDb.map((modelPrice) => {
    return {
      id: modelPrice.id,
      model_name: modelPrice.model_name,
      match_pattern: modelPrice.match_pattern,
      prices: {
        input_price: modelPrice.input_price?.toNumber(),
        output_price: modelPrice.output_price?.toNumber(),
        total_price: modelPrice.total_price?.toNumber(),
      },
    };
  });
}

async function main() {
  try {
    const modelPrices = await getDefaultModelPrices();

    await fs.writeFile(EXPORT_PATH, JSON.stringify(modelPrices, null, 2));

    console.log(
      `✅ ${modelPrices.length} default model prices written to ${EXPORT_PATH}.`
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
