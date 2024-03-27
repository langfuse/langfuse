import { Prisma } from "@langfuse/shared/src/db";

export class ResourceNotFoundError extends Error {
  id: string;
  constructor(type: string, id: string) {
    super(`${type} with ${id} not found}`);
    this.name = "ResourceNotFoundError";
    this.id = id;
  }
}

export function isPrismaException(e: unknown) {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientUnknownRequestError ||
    e instanceof Prisma.PrismaClientRustPanicError ||
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientValidationError
  );
}
