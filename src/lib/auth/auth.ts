import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { authConfig } from "@/lib/auth/auth.config";
import { assertRuntimeEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

// Log a precise reason (never a value) when auth-critical env vars are missing.
// Without this, Auth.js only surfaces `500 /login?error=Configuration`.
assertRuntimeEnv("auth");

const providers: Provider[] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

providers.push(
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw) {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) return null;
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) {
        // Mitigate user-enumeration timing differences
        await verifyPassword(password, "scrypt$16384$8$1$AAAA$AAAA");
        return null;
      }
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) return null;

      const requireVerification = process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false";
      if (requireVerification && !user.emailVerified) {
        logger.info("auth.login.unverified", { userId: user.id });
        throw new Error("EMAIL_NOT_VERIFIED");
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      };
    },
  }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // Block sign-in for locally locked accounts without verification when required
      if (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false" && user.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing && !existing.emailVerified && !existing.passwordHash) {
          // OAuth users are verified by the provider; mark verified on first OAuth sign-in
          await prisma.user.update({
            where: { id: existing.id },
            data: { emailVerified: new Date() },
          });
        }
      }
      return true;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (existing && !existing.emailVerified) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { emailVerified: new Date() },
          });
        }
      }
    },
  },
});
