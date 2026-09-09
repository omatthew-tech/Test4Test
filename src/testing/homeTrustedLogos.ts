import type { HomeTrustedSubmission } from "../lib/homeTrustedSubmissions";

// Development-only fixtures: never contact Supabase or a product website.
export function fixtureHomeTrustedLogos(submissions: HomeTrustedSubmission[]) {
  const images = [
    "/brand/test4test-mark.svg",
    "/images/trusted-by/vidsyndicate.png",
    "/images/trusted-by/pinch.png",
    "/images/trusted-by/akari.svg",
    "/images/trusted-by/mytinerary.png",
    "/images/trusted-by/loventro.webp",
  ];
  const scenario = new URLSearchParams(window.location.search).get("ds-home-logos");
  return Object.fromEntries(
    submissions.map((submission, index) => [
      submission.id,
      scenario === "missing" ? null : images[index % images.length],
    ]),
  );
}
