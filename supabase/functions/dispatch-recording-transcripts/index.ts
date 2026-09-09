import { transcriptHandler, transcriptJson } from "../_shared/transcript-http.ts";

Deno.serve((request) =>
  transcriptHandler(request, "dispatcher", async ({ admin }) => {
    const workerUrl = Deno.env.get("VIDEO_PROCESSOR_URL")?.trim().replace(/\/+$/, "");
    const secret = Deno.env.get("VIDEO_PROCESSOR_SHARED_SECRET")?.trim();
    if (!workerUrl || !secret) throw new Error("Worker configuration missing");
    const { error: reuseError } = await admin.rpc("reuse_existing_recording_transcripts", {
      p_limit: 25,
    });
    if (reuseError) throw new Error("Transcript cache preparation failed");
    const { data: jobs, error } = await admin.rpc("claim_recording_transcripts", { p_limit: 2 });
    if (error) throw new Error("Transcript claim failed");
    let dispatched = 0;
    for (const job of jobs ?? []) {
      let event = "failed";
      try {
        const isR2 = job.source_bucket.startsWith("r2:");
        let sourceUrl: string | undefined;
        if (!isR2) {
          const { data, error } = await admin.storage
            .from(job.source_bucket)
            .createSignedUrl(job.source_path, 3600);
          if (error || !data?.signedUrl) throw new Error("Source access failed");
          sourceUrl = data.signedUrl;
        }
        const response = await fetch(`${workerUrl}/recordings/transcripts/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-worker-secret": secret },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            responseId: job.response_id,
            attemptId: job.attempt_id,
            source: isR2
              ? { bucket: job.source_bucket.slice(3), objectKey: job.source_path }
              : { url: sourceUrl },
          }),
        });
        if (response.ok) {
          dispatched++;
          continue;
        }
        if (response.status === 429 || response.status === 503) event = "busy";
      } catch {
        // Keep URLs and provider error bodies out of logs and job error columns.
      }
      const { error: finishError } = await admin.rpc("finish_recording_transcript", {
        p_response_id: job.response_id,
        p_attempt_id: job.attempt_id,
        p_event: event,
      });
      if (finishError) throw new Error("Transcript dispatch recovery failed");
    }
    return transcriptJson({ ok: true, claimed: jobs?.length ?? 0, dispatched });
  }),
);
