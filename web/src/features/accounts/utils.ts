import * as crypto from "crypto";
import { TRPCError } from "@trpc/server";

export function generateSyntheticUsername({ name }: { name: string }) {
  return `SYNTH_${name}`;
}

export function generateSnapshotUsername({
  name,
  sessionNumber, // s9
  turnNumber, // t1
}: {
  name: string;
  sessionNumber: string;
  turnNumber: string;
}) {
  return `SNAP_${name}_${sessionNumber}_${turnNumber}`;
}

export const HARDCODED_USER_PASSWORD =
  process.env.USER_DEFAULT_PASSWORD || "123";

export function hashChainlitPassword(password: string): string {
  if (password.trim() === "") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Password cannot be empty",
    });
  }

  const authSecret = process.env.CHAINLIT_AUTH_SECRET;

  if (!authSecret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "CHAINLIT_AUTH_SECRET is not configured",
    });
  }

  return crypto
    .createHash("sha256")
    .update(password + authSecret, "utf-8")
    .digest("hex");
}
