export const NOTIFICATION_DISPATCH_PATH = "/api/notifications/dispatch";

export function bypassesUserSessionProxy(pathname: string) {
  return pathname === NOTIFICATION_DISPATCH_PATH;
}

export function isPublicApplicationRoute(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/offline" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/auth")
  );
}

export function requiresUserSession(pathname: string) {
  return (
    !bypassesUserSessionProxy(pathname) &&
    !isPublicApplicationRoute(pathname)
  );
}
