import { createClient } from "npm:@supabase/supabase-js@2.100.1";
import { schedulerRequest } from "../_shared/background-scheduler.ts";

Deno.serve((request) =>
  schedulerRequest(request, {
    secret: Deno.env.get("BACKGROUND_SCHEDULER_SECRET")?.trim() ?? "",
    run: async (action) => {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
          },
        },
      );
      const { data, error } = await admin.rpc("background_scheduler_tick", { p_action: action });
      if (error) throw new Error("Scheduler database request failed");
      return data;
    },
  }),
);
