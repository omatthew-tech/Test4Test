import { createAdminClient, getEmailEnvironment } from "../_shared/email-system.ts";
import { runNewUserFollowups } from "../_shared/new-user-followups.ts";

Deno.serve((request: Request) =>
  runNewUserFollowups(request, {
    secret: Deno.env.get("TEST_BACK_REMINDER_CRON_SECRET")?.trim() ?? "",
    connect: () => {
      const env = getEmailEnvironment();
      return { env, admin: createAdminClient(env) };
    },
  }),
);
