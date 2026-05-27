const ensurePrismaClientGenerated = async (databaseUrl: string) => {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const path = await import("path");
  const sharedDir = path.resolve(__dirname, "../../../packages/shared");
  const repoRoot = path.resolve(sharedDir, "../..");
  const schemaPath = path.join(sharedDir, "prisma", "schema.prisma");
  const pnpmPrismaSchemaPaths = fs.existsSync(
    path.join(repoRoot, "node_modules", ".pnpm"),
  )
    ? fs
        .readdirSync(path.join(repoRoot, "node_modules", ".pnpm"), {
          withFileTypes: true,
        })
        .filter(
          (entry) =>
            entry.isDirectory() && entry.name.startsWith("@prisma+client@"),
        )
        .map((entry) =>
          path.join(
            repoRoot,
            "node_modules",
            ".pnpm",
            entry.name,
            "node_modules",
            ".prisma",
            "client",
            "schema.prisma",
          ),
        )
    : [];
  const generatedSchemaPaths = [
    path.join(repoRoot, "node_modules", ".prisma", "client", "schema.prisma"),
    path.join(sharedDir, "node_modules", ".prisma", "client", "schema.prisma"),
    ...pnpmPrismaSchemaPaths,
  ];

  const sourceSchemaStat = fs.statSync(schemaPath);
  const hasCurrentGeneratedClient = generatedSchemaPaths.some(
    (generatedSchemaPath) => {
      if (!fs.existsSync(generatedSchemaPath)) {
        return false;
      }

      const generatedSchemaStat = fs.statSync(generatedSchemaPath);
      return generatedSchemaStat.mtimeMs >= sourceSchemaStat.mtimeMs;
    },
  );

  if (hasCurrentGeneratedClient) {
    return;
  }

  execSync(
    "dotenv -e ../../.env.test -e ../../.env -- npx prisma generate --no-hints",
    {
      cwd: sharedDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    },
  );

  const generatedClientExists = generatedSchemaPaths.some(
    (generatedSchemaPath) => fs.existsSync(generatedSchemaPath),
  );

  if (!generatedClientExists) {
    throw new Error(
      `Prisma client was not generated. Checked: ${generatedSchemaPaths.join(", ")}`,
    );
  }
};

const migrateTestDatabase = async (databaseUrl: string) => {
  const { execSync } = await import("child_process");
  const path = await import("path");
  const sharedDir = path.resolve(__dirname, "../../../packages/shared");

  execSync(
    "dotenv -e ../../.env.test -e ../../.env -- npx prisma migrate deploy",
    {
      cwd: sharedDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    },
  );
};

const ensureTestDatabaseExists = async () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (
    !databaseUrl?.includes("langfuse_test") ||
    process.env.NODE_ENV !== "test"
  ) {
    return;
  }

  await ensurePrismaClientGenerated(databaseUrl);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Test database already exists and is accessible");
  } catch {
    console.log("Test database not accessible, creating...");

    const url = new URL(databaseUrl);
    const dbName = url.pathname.slice(1);
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = "/postgres";

    const adminPrisma = new PrismaClient({
      datasources: {
        db: {
          url: adminUrl.toString(),
        },
      },
    });

    try {
      await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`Created test database: ${dbName}`);
    } catch (createError) {
      const message =
        createError instanceof Error
          ? createError.message
          : String(createError);

      if (message.includes("already exists")) {
        console.log("Test database already exists");
      } else {
        console.error("Failed to create test database:", createError);
      }
    } finally {
      await adminPrisma.$disconnect();
    }
  } finally {
    await prisma.$disconnect();
  }

  await migrateTestDatabase(databaseUrl);
  console.log("Test database schema verified/updated");
};

export async function setup() {
  await ensureTestDatabaseExists();
}
