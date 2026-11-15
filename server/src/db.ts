// Single import point for the generated Prisma client (Prisma 7 generates into src/generated/prisma).
import { Prisma, PrismaClient } from "@/generated/prisma/client.js"

export * from "@/generated/prisma/client.js"

/** A full client or an interactive-transaction client; both expose the model delegates. */
export type DbClient = PrismaClient | Prisma.TransactionClient
