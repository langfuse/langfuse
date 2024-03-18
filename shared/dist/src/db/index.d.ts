import { PrismaClient } from "@prisma/client";
declare const prismaClientSingleton: () => PrismaClient<{
    log: ("query" | "warn" | "error")[];
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}
export declare const prisma: PrismaClient<{
    log: ("query" | "warn" | "error")[];
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
export {};
