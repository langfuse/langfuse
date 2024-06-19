import {
  getDisplaySecretKey,
  hashSecretKey,
} from "@langfuse/shared/src/server";
import { verifyAuthHeaderAndReturnScope } from "@/src/features/public-api/server/apiAuth";
import { prisma } from "@langfuse/shared/src/db";

describe("Validate api calls", () => {
  beforeEach(async () => {
    await prisma.score.deleteMany();
    await prisma.observation.deleteMany();
    await prisma.trace.deleteMany();
    await prisma.apiKey.deleteMany();
  });

  it("should create new api key", async () => {
    await createAPIKey();
    const auth = await verifyAuthHeaderAndReturnScope(
      "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
    );
    expect(auth.validKey).toBe(true);

    const apiKey = await prisma.apiKey.findUnique({
      where: { publicKey: "pk-lf-1234567890" },
    });
    expect(apiKey).not.toBeNull();
    expect(apiKey?.fastHashedSecretKey).not.toBeNull();
  });

  it("should create new api key and succeed with new key", async () => {
    await createAPIKey();
    const auth = await verifyAuthHeaderAndReturnScope(
      "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
    );
    expect(auth.validKey).toBe(true);

    const apiKey = await prisma.apiKey.findUnique({
      where: { publicKey: "pk-lf-1234567890" },
    });
    expect(apiKey).not.toBeNull();
    expect(apiKey?.fastHashedSecretKey).not.toBeNull();

    const auth2 = await verifyAuthHeaderAndReturnScope(
      "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
    );
    expect(auth2.validKey).toBe(true);
  });

  it("should fail on wrong api key with new key", async () => {
    await createAPIKey();
    const auth = await verifyAuthHeaderAndReturnScope(
      "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
    );
    expect(auth.validKey).toBe(true);

    const apiKey = await prisma.apiKey.findUnique({
      where: { publicKey: "pk-lf-1234567890" },
    });
    expect(apiKey).not.toBeNull();
    expect(apiKey?.fastHashedSecretKey).not.toBeNull();

    const wrongAuth = await verifyAuthHeaderAndReturnScope(
      "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkx",
    );
    expect(wrongAuth.validKey).toBe(false);
  });

  it("should fail on wrong api key without new key", async () => {
    await createAPIKey();
    const initialApiKey = await prisma.apiKey.findUnique({
      where: { publicKey: "pk-lf-1234567890" },
    });
    expect(initialApiKey).not.toBeNull();
    expect(initialApiKey?.fastHashedSecretKey).toBeNull();

    const auth = await verifyAuthHeaderAndReturnScope(
      "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkx",
    );
    expect(auth.validKey).toBe(false);

    const apiKey = await prisma.apiKey.findUnique({
      where: { publicKey: "pk-lf-1234567890" },
    });
    expect(apiKey).not.toBeNull();
    expect(apiKey?.fastHashedSecretKey).toBeNull();
  });

  const createAPIKey = async () => {
    const seedApiKey = {
      id: "seed-api-key",
      secret: "sk-lf-1234567890",
      public: "pk-lf-1234567890",
      note: "seeded key",
    };
    await prisma.apiKey.create({
      data: {
        note: seedApiKey.note,
        id: seedApiKey.id,
        publicKey: seedApiKey.public,
        hashedSecretKey: await hashSecretKey(seedApiKey.secret),
        displaySecretKey: getDisplaySecretKey(seedApiKey.secret),
        project: {
          connect: {
            id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          },
        },
      },
    });
  };

  afterAll(async () => {
    await prisma.apiKey.deleteMany();
    await createAPIKey();
  });
});
