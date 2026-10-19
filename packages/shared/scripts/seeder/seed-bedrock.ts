import { PrismaClient } from "@prisma/client";
import { seedLocalBedrockConnection } from "./local-bedrock";

const prisma = new PrismaClient();

seedLocalBedrockConnection(prisma, process.env)
  .then((connection) => {
    console.log(
      `Seeded ${connection.provider}: ${connection.customModels.join(", ")}`,
    );
    console.log(
      "Use AWS_PROFILE=playground in web and worker. In Cloud DEV mode, allowlist project 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a in LANGFUSE_BEDROCK_LLM_CONNECTION_RUNTIME_CREDENTIALS_ALLOWED_PROJECT_IDS.",
    );
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Bedrock seed failed.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
