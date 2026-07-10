import crypto from "node:crypto";
import { type NextApiRequest, type NextApiResponse } from "next";
import { ServiceUnavailableError, UnauthorizedError } from "@langfuse/shared";
import { recordIncrement } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { submitFeedback } from "./FeedbackService";
import {
  PostFeedbackBody,
  PostFeedbackResponse,
} from "@/src/features/public-api/types/feedback";

const hasValidCredential = (authorization: string | undefined): boolean => {
  const configuredToken = env.LANGFUSE_FEEDBACK_INTAKE_TOKEN;
  if (!configuredToken) {
    throw new ServiceUnavailableError("Feedback intake is unavailable");
  }

  const suppliedToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const suppliedDigest = crypto
    .createHash("sha256")
    .update(suppliedToken)
    .digest();
  const configuredDigest = crypto
    .createHash("sha256")
    .update(configuredToken)
    .digest();

  return crypto.timingSafeEqual(suppliedDigest, configuredDigest);
};

export default async function feedbackApiHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!hasValidCredential(req.headers.authorization)) {
    recordIncrement("langfuse.feedback.submission", 1, {
      source: "langfuse-docs-mcp",
      outcome: "authentication_failed",
    });
    throw new UnauthorizedError("Invalid feedback intake credential");
  }

  const input = PostFeedbackBody.parse(req.body);
  const response = await submitFeedback({
    input,
    source: "langfuse-docs-mcp",
  });

  res.status(201).json(PostFeedbackResponse.parse(response));
}
