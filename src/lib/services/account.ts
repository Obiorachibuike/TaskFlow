/**
 * Account registration, email verification, and password reset.
 * Tokens are stored hashed and are single-use.
 */
import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { hashPassword, verifyPassword, randomToken, sha256Hex } from "@/lib/auth/password";
import {
  registerSchema,
  resetPasswordSchema,
  forgotPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "@/lib/validation";
import { avatarColorFor } from "@/lib/utils";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "@/lib/email";
import { logger } from "@/lib/logger";
import type { z } from "zod";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function registerAccount(raw: z.infer<typeof registerSchema>) {
  const input = registerSchema.parse(raw);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ServiceError("CONFLICT", "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      avatarColor: avatarColorFor(input.email),
    },
  });

  await issueAuthToken(user.id, "EMAIL_VERIFICATION", VERIFY_TTL_MS, (token) =>
    sendVerificationEmail(user.email, user.name, token),
  );

  return { id: user.id, email: user.email, name: user.name };
}

async function issueAuthToken(
  userId: string,
  purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  ttlMs: number,
  deliver: (token: string) => Promise<unknown>,
) {
  const token = randomToken();
  const tokenHash = sha256Hex(token);
  await prisma.authToken.create({
    data: {
      userId,
      purpose,
      tokenHash,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  try {
    await deliver(token);
  } catch (err) {
    logger.warn("account.email_delivery_failed", { purpose, err: String(err) });
    // Do not fail registration if email transport is down in dev; token is still valid.
  }
  return token;
}

export async function resendVerificationEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return; // do not leak account state
  await issueAuthToken(user.id, "EMAIL_VERIFICATION", VERIFY_TTL_MS, (token) =>
    sendVerificationEmail(user.email, user.name, token),
  );
}

export async function verifyEmail(token: string) {
  const tokenHash = sha256Hex(token);
  const record = await prisma.authToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record || record.purpose !== "EMAIL_VERIFICATION") {
    throw new ServiceError("NOT_FOUND", "This verification link is invalid.");
  }
  if (record.usedAt) {
    throw new ServiceError("CONFLICT", "This verification link was already used.");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ServiceError("CONFLICT", "This verification link has expired.");
  }

  await prisma.$transaction([
    prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
  ]);
  return { email: record.user.email };
}

export async function requestPasswordReset(raw: z.infer<typeof forgotPasswordSchema>) {
  const input = forgotPasswordSchema.parse(raw);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Always report success — never reveal whether an account exists
  if (!user?.passwordHash) return;

  // Invalidate previous reset tokens
  await prisma.authToken.updateMany({
    where: { userId: user.id, purpose: "PASSWORD_RESET", usedAt: null },
    data: { usedAt: new Date() },
  });
  await issueAuthToken(user.id, "PASSWORD_RESET", RESET_TTL_MS, (token) =>
    sendPasswordResetEmail(user.email, user.name, token),
  );
}

export async function resetPassword(raw: z.infer<typeof resetPasswordSchema>) {
  const input = resetPasswordSchema.parse(raw);
  const tokenHash = sha256Hex(input.token);
  const record = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!record || record.purpose !== "PASSWORD_RESET") {
    throw new ServiceError("NOT_FOUND", "This reset link is invalid.");
  }
  if (record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new ServiceError("CONFLICT", "This reset link has expired or was already used.");
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    // Invalidate all sessions after password reset
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
}

export async function updateProfile(actor: Actor, raw: z.infer<typeof updateProfileSchema>) {
  const input = updateProfileSchema.parse(raw);
  return prisma.user.update({
    where: { id: actor.userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.timeZone !== undefined ? { timeZone: input.timeZone } : {}),
      ...(input.avatarColor !== undefined ? { avatarColor: input.avatarColor } : {}),
    },
    select: { id: true, name: true, email: true, image: true, avatarColor: true, timeZone: true },
  });
}

export async function changePassword(actor: Actor, raw: z.infer<typeof changePasswordSchema>) {
  const input = changePasswordSchema.parse(raw);
  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!user?.passwordHash) {
    throw new ServiceError("CONFLICT", "This account signs in with OAuth and has no local password.");
  }
  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) throw new ServiceError("FORBIDDEN", "Current password is incorrect.");
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
}
