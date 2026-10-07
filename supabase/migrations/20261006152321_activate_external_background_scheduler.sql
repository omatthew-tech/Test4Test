-- Apply only after the external Worker and its authenticated Edge endpoint have
-- both been deployed and observed. Leave job definitions available for rollback.
do $$
begin
  if not exists(select 1 from private.background_scheduler_health
      where action='recover' and last_success_at > now()-interval '10 minutes')
    or not exists(select 1 from private.background_scheduler_health
      where action='maintain' and last_success_at > now()-interval '1 hour') then
    raise exception 'Verify external recovery and maintenance before disabling cron';
  end if;
  perform cron.alter_job(jobid, active := false) from cron.job
    where jobname in ('dispatch-recording-transcripts','dispatch-recording-clips','dispatch-chat-notifications');
end;
$$;
