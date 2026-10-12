import { cache } from "react";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";

export interface Actor {
  userId: string;
  name: string;
  email: string;
}

/** Cached per-request current user (server components + actions). */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, image: true, avatarColor: true, timeZone: true, emailVerified: true },
  });
  if (!user) return null;
  return user;
});

export async function requireUser(): Promise<Actor & { name: string; email: string }> {
  const user = await getCurrentUser();
  if (!user) throw new ServiceError("UNAUTHENTICATED", "You must be signed in.");
  return { userId: user.id, name: user.name, email: user.email };
}

export async function requireUserFull() {
  const user = await getCurrentUser();
  if (!user) throw new ServiceError("UNAUTHENTICATED", "You must be signed in.");
  return user;
}
