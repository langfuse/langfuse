export const sum = (a: number, b: number) => a + b;

export const subtract = (a: number, b: number) => a - b;

export const multiply = (a: number, b: number) => a * b;

import { prisma } from "./db";

const abc = prisma.apiKey.findMany();

export * from "./auth/auth";
export * from "./constants";
export * from "./db";

// exporting the generated type for Kysely
export * from "../prisma/generated/types";
