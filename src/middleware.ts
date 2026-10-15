import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Protect app + onboarding routes; keep public/landing/auth pages open.
  matcher: ["/app/:path*", "/onboarding/:path*", "/login", "/register", "/forgot-password", "/reset-password"],
};
