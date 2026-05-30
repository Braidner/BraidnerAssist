import { PrismaClient } from "@prisma/client";

// Единый экземпляр Prisma на процесс.
export const prisma = new PrismaClient();
