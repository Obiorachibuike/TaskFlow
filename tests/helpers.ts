import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { Actor } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

let client: PrismaClient | null = null;

export function testPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }
  return client;
}

let counter = 0;

export async function createTestUser(name = "Test User"): Promise<Actor & { id: string }> {
  counter += 1;
  const email = `test-${Date.now()}-${counter}@taskflow.dev`;
  const user = await testPrisma().user.create({
    data: {
      name: `${name} ${counter}`,
      email,
      passwordHash: await hashPassword("password123"),
      emailVerified: new Date(),
    },
  });
  return { id: user.id, userId: user.id, name: user.name, email: user.email };
}

export async function cleanupTestDb() {
  const p = testPrisma();
  // cascade deletes handle children
  await p.workspace.deleteMany({});
  await p.user.deleteMany({});
}
