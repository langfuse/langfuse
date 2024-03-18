"use strict";
// prisma needs to be exported from the package which does migrations.
// The prisma package contains the generated schema and is exported with the PrismaClient.
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const process_1 = require("process");
// Instantiated according to the Prisma documentation
// https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
const prismaClientSingleton = () => {
    return new client_1.PrismaClient({
        log: process_1.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error", "warn"],
    });
};
exports.prisma = (_a = globalThis.prisma) !== null && _a !== void 0 ? _a : prismaClientSingleton();
if (process.env.NODE_ENV !== "production")
    globalThis.prisma = exports.prisma;
