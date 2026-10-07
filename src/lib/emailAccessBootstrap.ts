// This module must stay free of application, analytics, and Supabase imports.
export function captureEmailAccessToken() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get("token") ?? "";
  window.history.replaceState(null, "", "/email-access");
  return /^[a-f0-9]{64}$/.test(token) ? token : "";
}
