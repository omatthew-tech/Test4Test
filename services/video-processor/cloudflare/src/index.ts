import { DurableObject } from "cloudflare:workers";
import { MediaContainerLifecycle } from "./containerLifecycle";
import { routeMediaRequest, type MediaBinding } from "./routing";

interface Environment {
  MEDIA: MediaBinding;
  WORKER_SHARED_SECRET: string;
  GROQ_API_KEY: string;
  CLOUDFLARE_ACCESS_KEY_ID: string;
  CLOUDFLARE_SECRET_ACCESS_KEY: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_SOURCE_BUCKET_NAME: string;
  SUPABASE_URL: string;
}

export class MediaContainer extends DurableObject<Environment> {
  private readonly lifecycle: MediaContainerLifecycle;

  constructor(ctx: DurableObjectState, env: Environment) {
    super(ctx, env);
    if (!ctx.container) throw new Error("Media container binding is missing.");
    const envVars = {
      PORT: "8787",
      NODE_ENV: "production",
      WORKER_SHARED_SECRET: this.env.WORKER_SHARED_SECRET,
      GROQ_API_KEY: this.env.GROQ_API_KEY,
      CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_ACCESS_KEY_ID: this.env.CLOUDFLARE_ACCESS_KEY_ID,
      CLOUDFLARE_SECRET_ACCESS_KEY: this.env.CLOUDFLARE_SECRET_ACCESS_KEY,
      CLOUDFLARE_BUCKET_NAME: this.env.CLOUDFLARE_SOURCE_BUCKET_NAME,
      CLOUDFLARE_SOURCE_BUCKET_NAME: this.env.CLOUDFLARE_SOURCE_BUCKET_NAME,
      // Existing source-deletion cleanup still needs the old image bucket.
      THUMBNAIL_BUCKET_NAME: "usability-test-screenshots",
      CLOUDFLARE_ENDPOINT: `https://${this.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      TRANSCRIPT_COMPLETION_WEBHOOK_URL: `${this.env.SUPABASE_URL}/functions/v1/complete-recording-transcript`,
      CLIP_COMPLETION_WEBHOOK_URL: `${this.env.SUPABASE_URL}/functions/v1/complete-recording-clip`,
    };
    this.lifecycle = new MediaContainerLifecycle(
      ctx.container,
      ctx.storage,
      {
        image: ctx.container.images.media,
        instance: "standard-2",
        enableInternet: true,
        env: envVars,
      },
      env.WORKER_SHARED_SECRET,
      (exit) =>
        ctx.waitUntil(exit.catch(() => console.error("Media container exited with an error."))),
    );
    void ctx.blockConcurrencyWhile(() => this.lifecycle.restore());
  }

  submitMedia(request: Request) {
    return this.lifecycle.fetch(request);
  }

  override fetch(request: Request) {
    return this.submitMedia(request);
  }

  override alarm() {
    return this.lifecycle.alarm();
  }
}

export default { fetch: routeMediaRequest };
