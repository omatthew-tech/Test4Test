import { createServer } from "vite";

process.env.VITE_DS_FIXTURES = "1";
process.env.VITE_TEST_ACCOUNT_EMAIL = "avery@demo.test4test.app";
process.env.VITE_SUPABASE_URL = "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "";
process.env.VITE_SUPABASE_ANON_KEY = "";

// Capture-only media; the production clip editor is unchanged.
const server = await createServer({
  plugins: [
    {
      name: "review-onboarding-sample-recording",
      enforce: "pre",
      transform(source, id) {
        if (!id.replaceAll("\\", "/").endsWith("/src/pages/RecordingViewPage.tsx")) return;
        return source.replace(
          '"/videos/home-share-test.mp4"',
          '"/output/review-onboarding/sample-recording.mp4"',
        );
      },
    },
  ],
  server: { host: "127.0.0.1", port: 5183, strictPort: true },
});
await server.listen();
server.printUrls();
