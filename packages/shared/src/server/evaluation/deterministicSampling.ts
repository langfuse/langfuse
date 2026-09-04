import { createHash } from "node:crypto";

const SAMPLING_DOMAIN = "langfuse:evaluation-sampling:v1\0";
const SAMPLING_BUCKET_COUNT = 2 ** 53;

export function getDeterministicSamplingValue(targetId: string) {
  const digest = createHash("sha256")
    .update(SAMPLING_DOMAIN, "utf8")
    .update(targetId, "utf8")
    .digest();

  const hash53 = digest.readBigUInt64BE(0) >> 11n;

  return Number(hash53) / SAMPLING_BUCKET_COUNT;
}

export function shouldSampleEvaluation(params: {
  samplingValue: number;
  samplingRate: number;
}) {
  const { samplingValue, samplingRate } = params;

  if (samplingRate >= 1) return true;
  if (samplingRate <= 0) return false;

  return samplingValue < samplingRate;
}
