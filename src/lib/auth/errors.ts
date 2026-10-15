/**
 * Human-readable explanations for the `?error=` codes Auth.js appends when it
 * redirects to `pages.error` (`/login`). Without this the sign-in page silently
 * ignores the parameter and users see a form that cannot possibly work.
 */
export const AUTH_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: "Sign-in is not configured on this deployment",
    description:
      "The server is missing required auth settings (usually AUTH_SECRET). An administrator must set them in the hosting environment and redeploy.",
  },
  AccessDenied: {
    title: "Sign-in blocked",
    description: "You are not allowed to sign in with this account.",
  },
  Verification: {
    title: "Verification link expired",
    description: "This link has already been used or is no longer valid. Request a new one.",
  },
  CredentialsSignin: {
    title: "Sign in failed",
    description: "Invalid email or password.",
  },
  OAuthAccountNotLinked: {
    title: "Email already in use",
    description:
      "That email is registered with a different sign-in method. Use the original method, or reset your password.",
  },
  EmailSignInError: {
    title: "Could not send the sign-in email",
    description: "Check your address and try again in a minute.",
  },
  SessionRequired: {
    title: "Sign in required",
    description: "Please sign in to continue.",
  },
  default: {
    title: "Sign in failed",
    description: "Something went wrong. Please try again.",
  },
};

export function describeAuthError(code: string | null | undefined) {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? { ...AUTH_ERROR_MESSAGES.default, title: `Sign in failed (${code})` };
}
