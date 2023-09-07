import { verifySecretKey } from "@/src/features/publicApi/lib/apiKeys";
import { type ApiAccessScope } from "@/src/features/publicApi/server/types";
import { prisma } from "@/src/server/db";

type AuthHeaderVerificationResult =
  | {
      validKey: true;
      scope: ApiAccessScope;
    }
  | {
      validKey: false;
      error: string;
    };

export async function verifyAuthHeaderAndReturnScope(
  authHeader: string | undefined,
): Promise<AuthHeaderVerificationResult> {
  if (!authHeader) {
    console.error("No authorization header");
    return {
      validKey: false,
      error: "No authorization header",
    };
  }

  try {
    // Basic auth, full scope, needs secret key and public key
    if (authHeader.startsWith("Basic ")) {
      const { username: publicKey, password: secretKey } =
        extractBasicAuthCredentials(authHeader);

      const dbKey = await findDbKeyOrThrow(publicKey);

      const isValid = await verifySecretKey(secretKey, dbKey.hashedSecretKey);
      if (!isValid) throw new Error("Invalid credentials");

      return {
        validKey: true,
        scope: {
          projectId: dbKey.projectId,
          accessLevel: "all",
        },
      };
    }
    // Bearer auth, limited scope, only needs public key
    if (authHeader.startsWith("Bearer ")) {
      const publicKey = authHeader.replace("Bearer ", "");

      const dbKey = await findDbKeyOrThrow(publicKey);

      return {
        validKey: true,
        scope: {
          projectId: dbKey.projectId,
          accessLevel: "scores",
        },
      };
    }
  } catch (error: unknown) {
    console.error("Error verifying auth header: ", error);
    return {
      validKey: false,
      error: error instanceof Error ? error.message : "Authorization error",
    };
  }

  return {
    validKey: false,
    error: "Invalid authorization header",
  };
}

function extractBasicAuthCredentials(basicAuthHeader: string): {
  username: string;
  password: string;
} {
  const authValue = basicAuthHeader.split(" ")[1];
  if (!authValue) throw new Error("Invalid authorization header");

  const [username, password] = atob(authValue).split(":");
  if (!username || !password) throw new Error("Invalid authorization header");
  return { username, password };
}

async function findDbKeyOrThrow(publicKey: string) {
  const dbKey = await prisma.apiKey.findUnique({
    where: { publicKey },
  });
  if (!dbKey) throw new Error("Invalid public key");
  return dbKey;
}
