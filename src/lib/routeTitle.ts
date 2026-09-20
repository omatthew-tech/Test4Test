import { useEffect } from "react";
import { formatPageTitle } from "./pageMetadata";

const routeTitles: Record<string, string> = {
  "/sign-in": "Sign in",
  "/submit": "Submit your app",
  "/verify": "Verify your email",
  "/get-paid-to-test": "Get paid to test",
  "/get-paid-to-test/signup": "Tester signup",
  "/earn": "Earn",
  "/share": "Share",
  "/analytics": "Analyze",
  "/recordings": "Recordings",
  "/recordings/shared": "Shared recording",
  "/messages": "Messages",
  "/email-preview": "Email preview",
  "/submissions": "My reviews",
  "/credits": "Credits",
  "/profile": "Profile",
  "/admin": "Admin",
  "/banned": "Account unavailable",
};

export function getRouteTitle(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  // These pages own their full metadata, including article-specific titles.
  if (path === "/" || path === "/blog" || /^\/blog\/[^/]+$/i.test(path)) return null;
  if (/^\/test\/[^/]+\/success$/i.test(path)) return "Feedback submitted";
  if (/^\/test\/[^/]+$/i.test(path)) return "Test session";
  if (/^\/submissions\/[^/]+\/revise$/i.test(path)) return "Revise feedback";
  if (/^\/messages\/[^/]+$/i.test(path)) return "Messages";
  return routeTitles[path.toLowerCase()] ?? "Page not found";
}

export function useRouteTitle(pathname: string) {
  const title = getRouteTitle(pathname);
  useEffect(() => {
    if (title) document.title = formatPageTitle(title);
  }, [pathname, title]);
}
