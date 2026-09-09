export interface SourceOverride {
  submissionId: string;
  expectedDestination: string;
  sourcePage: string;
  imageUrl: string;
  local?: boolean;
}

// Verified 2026-09-08. Match both the submission and its destination so an edit
// cannot leave a previous product's branding attached to the card.
export const verifiedSources: SourceOverride[] = [
  {
    submissionId: "f4afe8df-d3cb-48cf-b894-c4061fad86f9",
    expectedDestination: "https://test4test.io/",
    sourcePage: "https://test4test.io/",
    imageUrl: "/brand/test4test-mark.svg",
    local: true,
  },
  {
    submissionId: "06cc58db-e2d2-4f1e-9c98-c5af9864b6b6",
    expectedDestination: "https://vidshare.us/",
    sourcePage: "https://vidsyndicate.com/",
    imageUrl: "https://vidsyndicate.com/favicon-32x32.png?v=20260806-2",
  },
  {
    submissionId: "3e7dee0a-ab78-40c9-a5aa-56b0bbafc374",
    expectedDestination: "https://lambent-piroshki-f8aac6.netlify.app/",
    sourcePage: "https://www.pinch.marketing/",
    imageUrl:
      "https://static.wixstatic.com/media/d20b85_9ec1e0ada5e546b3990d0cd1329de2e7%7Emv2.png/v1/fill/w_192%2Ch_192%2Clg_1%2Cusm_0.66_1.00_0.01/d20b85_9ec1e0ada5e546b3990d0cd1329de2e7%7Emv2.png",
  },
  {
    submissionId: "2d31edac-1151-4786-976c-0b9674eda273",
    expectedDestination: "https://ai-akari.ai/one-minute/en",
    sourcePage: "https://ai-akari.ai/manifest.webmanifest",
    imageUrl: "https://ai-akari.ai/favicon.svg",
  },
  {
    submissionId: "ccb8473b-49d6-4554-b180-d3c4e59b2e05",
    expectedDestination: "https://themytineraryapp.lovable.app/",
    sourcePage: "https://themytineraryapp.lovable.app/",
    imageUrl: "https://themytineraryapp.lovable.app/favicon.png",
  },
  {
    submissionId: "1bd407b6-4c52-4948-8251-0436de7493b6",
    expectedDestination: "https://www.loventro.com/",
    sourcePage: "https://www.indiehackers.com/product/loventro",
    imageUrl:
      "https://storage.googleapis.com/indie-hackers.appspot.com/product-avatars/loventro/200x200_loventro.webp",
  },
];
