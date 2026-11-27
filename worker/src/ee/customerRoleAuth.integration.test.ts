import { randomUUID } from "crypto";
import {
  CreateRoleCommand,
  IAMClient,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import {
  buildStorageRolePermissionPolicy,
  buildStorageRoleTrustPolicy,
  STORAGE_ROLE_READ_ACTIONS,
} from "@langfuse/shared";
import {
  generateCustomerRoleExternalId,
  getCustomerRoleCredentialsProvider,
} from "@langfuse/shared/src/server/ee/customerRoleAuth/customerRoleCredentials";
import { buildStorageReadSessionPolicy } from "@langfuse/shared/src/server/ee/storageRoleAuth/storageSessionPolicy";

// Runs against the floci service (`COMPOSE_PROFILES=worker-tests`, then
// LANGFUSE_TEST_FLOCI_ENDPOINT=http://localhost:4566). It enables IAM
// enforcement, so trust policies and session policies are evaluated.
const endpoint = process.env.LANGFUSE_TEST_FLOCI_ENDPOINT;
const describeWithFloci = endpoint ? describe : describe.skip;
const FLOCI_TEST_TIMEOUT_MS = 30_000;

const region = "us-east-1";
// Floci treats these unknown keys as the account root, which bypasses enforcement.
const rootCredentials = { accessKeyId: "test", secretAccessKey: "test" };

// The cross-account role is assumed through the default credential chain, which must
// resolve to Floci's root rather than the dev env's placeholder Bedrock keys.
if (endpoint) {
  process.env.AWS_ENDPOINT_URL_STS = endpoint;
  process.env.AWS_ACCESS_KEY_ID = rootCredentials.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = rootCredentials.secretAccessKey;
  process.env.AWS_REGION = region;
}

const clientConfig = {
  endpoint,
  region,
  credentials: rootCredentials,
};
const iam = new IAMClient(clientConfig);

const roleArn = (name: string) => `arn:aws:iam::000000000000:role/${name}`;

async function createRole({
  name,
  trustPolicy,
  permissions,
}: {
  name: string;
  trustPolicy: object;
  permissions: object;
}) {
  await iam.send(
    new CreateRoleCommand({
      RoleName: name,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
    }),
  );
  await iam.send(
    new PutRolePolicyCommand({
      RoleName: name,
      PolicyName: "permissions",
      PolicyDocument: JSON.stringify(permissions),
    }),
  );
  return roleArn(name);
}

async function setUpRoles({
  requireExternalId,
}: {
  requireExternalId: boolean;
}) {
  const suffix = randomUUID().slice(0, 8);
  const bucketName = `role-auth-${suffix}`;
  const prefix = "media/";
  const externalId = generateCustomerRoleExternalId();

  const crossAccountRoleArn = await createRole({
    name: `langfuse-access-${suffix}`,
    trustPolicy: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::000000000000:root" },
          Action: "sts:AssumeRole",
        },
      ],
    },
    permissions: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["sts:AssumeRole", "sts:SetSourceIdentity", "sts:TagSession"],
          Resource: "*",
        },
      ],
    },
  });

  // The policies the setup instructions tell the customer to attach.
  const trustPolicy = buildStorageRoleTrustPolicy({
    crossAccountRoleArn,
    externalId,
  });
  const [assumeStatement, tagStatement] = trustPolicy.Statement;
  const customerRoleName = `customer-${suffix}`;
  const customerRoleArn = roleArn(customerRoleName);
  await createRole({
    name: customerRoleName,
    trustPolicy: requireExternalId
      ? trustPolicy
      : {
          ...trustPolicy,
          Statement: [
            { ...assumeStatement, Condition: undefined },
            tagStatement,
          ],
        },
    // The role may read the whole bucket; only the session policy limits the
    // session to the prefix.
    permissions: buildStorageRolePermissionPolicy({
      roleArn: customerRoleArn,
      bucketName,
      prefix: null,
      actions: STORAGE_ROLE_READ_ACTIONS,
    }),
  });

  const s3 = new S3Client({ ...clientConfig, forcePathStyle: true });
  await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
  for (const key of ["media/allowed.txt", "other/denied.txt"]) {
    await s3.send(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: key }),
    );
  }

  const credentials = getCustomerRoleCredentialsProvider({
    crossAccountRoleArn,
    cacheKey: suffix,
    version: "1",
    roleArn: customerRoleArn,
    externalId,
    projectId: `project-${suffix}`,
    orgId: `org-${suffix}`,
    sessionPolicy: buildStorageReadSessionPolicy({
      roleArn: customerRoleArn,
      bucketName,
      prefix,
      region,
    }),
  });

  return { bucketName, credentials };
}

describeWithFloci("customer role auth against Floci", () => {
  it(
    "chains into the customer role and limits it to the session policy",
    async () => {
      const { bucketName, credentials } = await setUpRoles({
        requireExternalId: true,
      });
      const s3 = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials,
      });

      const allowed = await s3.send(
        new GetObjectCommand({ Bucket: bucketName, Key: "media/allowed.txt" }),
      );
      expect(await allowed.Body?.transformToString()).toBe("media/allowed.txt");

      await expect(
        s3.send(
          new GetObjectCommand({ Bucket: bucketName, Key: "other/denied.txt" }),
        ),
      ).rejects.toMatchObject({ name: "AccessDenied" });
    },
    FLOCI_TEST_TIMEOUT_MS,
  );

  it(
    "rejects a customer role whose trust policy does not require the external ID",
    async () => {
      const { credentials } = await setUpRoles({ requireExternalId: false });

      await expect(credentials()).rejects.toThrow(
        "The role's trust policy does not require the external ID",
      );
    },
    FLOCI_TEST_TIMEOUT_MS,
  );
});
