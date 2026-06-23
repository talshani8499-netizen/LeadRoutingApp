import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in dev AND across warm
// serverless invocations in prod, to avoid exhausting the DB connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Cache unconditionally: a new client per module-eval in serverless would open a
// fresh connection on every cold start and quickly exhaust Postgres connections.
globalForPrisma.prisma = prisma;
