/** @jest-environment node */

import { LLMAdapter } from "@langfuse/shared";
import {
  CreateLlmApiKey,
  UpdateLlmApiKey,
} from "@/src/features/llm-api-key/types";
import { PutLlmConnectionV1Body } from "@/src/features/public-api/types/llm-connections";

describe("OCI LLM connection schemas", () => {
  const ociBaseUrl =
    "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1";
  const ociModel = "xai.grok-4-1-fast-non-reasoning";
  const ociIamCredentials = JSON.stringify({
    tenancyId: "ocid1.tenancy.oc1..example",
    userId: "ocid1.user.oc1..example",
    fingerprint: "12:34:56:78:90:ab:cd:ef",
    privateKey: "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----",
  });

  it("accepts OCI connections with base URL and custom models in the internal schema", () => {
    const result = CreateLlmApiKey.safeParse({
      projectId: "project-1",
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: "sk-oci-test",
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
    });

    expect(result.success).toBe(true);
  });

  it("rejects OCI connections without base URL in the internal schema", () => {
    const result = CreateLlmApiKey.safeParse({
      projectId: "project-1",
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: "sk-oci-test",
      customModels: [ociModel],
      withDefaultModels: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "API Base URL is required for OCI connections.",
    );
  });

  it("rejects OCI connections without custom models in the internal schema", () => {
    const result = CreateLlmApiKey.safeParse({
      projectId: "project-1",
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: "sk-oci-test",
      baseURL: ociBaseUrl,
      withDefaultModels: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "At least one custom model is required for OCI.",
    );
  });

  it("accepts OCI IAM config payloads in the internal create schema", () => {
    const result = CreateLlmApiKey.safeParse({
      projectId: "project-1",
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: ociIamCredentials,
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
      config: {
        authMode: "iam",
        compartmentId:
          "ocid1.compartment.oc1..aaaaaaaajywsdmeuend5xaomrcceqdrsqbtjrsiguqjdr3cjuia7rncdiora",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts OCI IAM config payloads in the internal update schema", () => {
    const result = UpdateLlmApiKey.safeParse({
      id: "llm-key-1",
      projectId: "project-1",
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: ociIamCredentials,
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
      config: {
        authMode: "iam",
        compartmentId:
          "ocid1.compartment.oc1..aaaaaaaajywsdmeuend5xaomrcceqdrsqbtjrsiguqjdr3cjuia7rncdiora",
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts OCI connections with base URL and custom models in the public API schema", () => {
    const result = PutLlmConnectionV1Body.safeParse({
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: "sk-oci-test",
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
    });

    expect(result.success).toBe(true);
  });

  it("accepts OCI IAM config payloads in the public API schema", () => {
    const result = PutLlmConnectionV1Body.safeParse({
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: ociIamCredentials,
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
      config: {
        authMode: "iam",
        compartmentId:
          "ocid1.compartment.oc1..aaaaaaaajywsdmeuend5xaomrcceqdrsqbtjrsiguqjdr3cjuia7rncdiora",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed OCI IAM credentials in the internal schema", () => {
    const result = CreateLlmApiKey.safeParse({
      projectId: "project-1",
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: JSON.stringify({ tenancyId: "missing-fields" }),
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
      config: {
        authMode: "iam",
        compartmentId:
          "ocid1.compartment.oc1..aaaaaaaajywsdmeuend5xaomrcceqdrsqbtjrsiguqjdr3cjuia7rncdiora",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "OCI IAM credentials must include tenancyId, userId, fingerprint, and privateKey.",
    );
  });

  it("rejects malformed OCI config payloads in the public API schema", () => {
    const result = PutLlmConnectionV1Body.safeParse({
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: "sk-oci-test",
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
      config: {
        region: "us-chicago-1",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'Invalid OCI config: expected { authMode?: "api_key" | "iam", compartmentId?: string }',
    );
  });

  it("rejects OCI IAM config without compartment ID", () => {
    const result = PutLlmConnectionV1Body.safeParse({
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: ociIamCredentials,
      baseURL: ociBaseUrl,
      customModels: [ociModel],
      withDefaultModels: false,
      config: {
        authMode: "iam",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      'Invalid OCI config: expected { authMode?: "api_key" | "iam", compartmentId?: string }',
    );
  });

  it("rejects non-OCI base URLs in the internal schema", () => {
    const result = CreateLlmApiKey.safeParse({
      projectId: "project-1",
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: "sk-oci-test",
      baseURL: "https://api.openai.com/v1",
      customModels: [ociModel],
      withDefaultModels: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "OCI base URL must use an OCI Generative AI inference hostname.",
    );
  });

  it("rejects OCI base URLs with unsupported paths in the public API schema", () => {
    const result = PutLlmConnectionV1Body.safeParse({
      provider: "oci-prod",
      adapter: LLMAdapter.Oci,
      secretKey: "sk-oci-test",
      baseURL:
        "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/v1",
      customModels: [ociModel],
      withDefaultModels: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "OCI base URL must point to `/openai/v1` or `/20231130/actions/v1`.",
    );
  });
});
