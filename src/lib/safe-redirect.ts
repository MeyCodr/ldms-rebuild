/**
 * Where to send someone after sign-in, from the ?from= value. Only paths on
 * this site are allowed; anything else (another site, protocol-relative
 * "//host", backslash tricks such as "/\host", control characters) goes to "/".
 */
export function safeRedirect(from: unknown): string {
  if (typeof from !== "string" || from.length > 500) return "/";
  if (!from.startsWith("/") || from.startsWith("//")) return "/";
  // Browsers treat "\" like "/" in URLs, so "/\evil.example" means "//evil.example".
  // Control characters (tab, newline) are stripped by browsers too.
  if (/[\\\u0000-\u001f\u007f]/.test(from)) return "/";
  try {
    const url = new URL(from, "http://ldms.local");
    if (url.origin !== "http://ldms.local") return "/";
    if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
