import {
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

import { Authenticator } from "@/src/features/apiKey/auth";
import { authorize } from "@/src/features/auth/policy/authorize";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

describe("policy authenticate() composition", () => {
  let fixture: Awaited<ReturnType<typeof createOrgProjectAndApiKey>>;

  const basicHeader = () =>
    createBasicAuthHeader(fixture.publicKey, fixture.secretKey);

  const backfillFastHash = async () => {
    await new ApiAuthService(prisma, null).verifyAuthHeaderAndReturnScope(
      basicHeader(),
    );
  };

  const auth = (authorization: string) =>
    new Authenticator().auth({ headers: { authorization } });

  beforeEach(async () => {
    fixture = await createOrgProjectAndApiKey({ plan: "Hobby" });
  });

  it("resolves a project context from Basic auth", async () => {
    const result = await auth(basicHeader());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.context.principal.kind).toBe("apiKey");
    expect(
      authorize(result.context, "traces:read", {
        projectId: fixture.projectId,
      }).success,
    ).toBe(true);
  });

  it("authenticates a private key over Bearer with full project scope", async () => {
    await backfillFastHash();
    const result = await auth(`Bearer ${fixture.secretKey}`);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(
      authorize(result.context, "traces:read", {
        projectId: fixture.projectId,
      }).success,
    ).toBe(true);
  });

  it("authenticates a public key over Bearer with scores-only scope", async () => {
    const result = await auth(`Bearer ${fixture.publicKey}`);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(
      authorize(result.context, "scores:create", {
        projectId: fixture.projectId,
      }).success,
    ).toBe(true);
    expect(
      authorize(result.context, "traces:read", {
        projectId: fixture.projectId,
      }).success,
    ).toBe(false);
  });

  it("401s an unknown token", async () => {
    const result = await auth("Bearer not-a-real-key");
    expect(result.success).toBe(false);
  });

  it("keeps a NULL fast-hash key Basic-only", async () => {
    await backfillFastHash();
    await prisma.apiKey.update({
      where: { publicKey: fixture.publicKey },
      data: { fastHashedSecretKey: null },
    });
    expect((await auth(basicHeader())).success).toBe(true);
    expect((await auth(`Bearer ${fixture.secretKey}`)).success).toBe(false);
  });
});
