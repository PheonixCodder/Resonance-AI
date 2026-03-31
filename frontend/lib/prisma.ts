import { PrismaClient } from "@/lib/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaNeon } from "@prisma/adapter-neon";

// 1. Define a function to create the extended client
const prismaClientSingleton = () => {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  
  return new PrismaClient({ adapter }).$extends(withAccelerate());
};

// 2. Extract the type of the extended client
type ExtendedPrismaClient = ReturnType<typeof prismaClientSingleton>;

// 3. Update the global type to use the extended type
const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
