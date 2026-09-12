import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8').replaceAll('\r\n', '\n');
const base = read('supabase/migrations/20260909011828_recording_transcript_reports.sql');
const target = 'supabase/migrations/20260911183111_recording_only_versioned_feedback.sql';
const fn = (text, name) => {
  const start = text.indexOf('create function public.' + name + '(');
  if (start < 0) throw new Error(name);
  return text.slice(start, text.indexOf('\n$$;', start) + 4).replace('create function', 'create or replace function');
};
let claim = fn(base, 'claim_recording_transcripts');
claim = claim.replace('response_id, owner_user_id, source_bucket, source_path', 'response_id, version_id, owner_user_id, source_bucket, source_path')
  .replace('select r.id, s.user_id, r.recording_bucket, r.recording_path', 'select r.response_id, r.id, s.user_id, r.recording_bucket, r.recording_path')
  .replace('from public.test_responses r join public.submissions s on s.id = r.submission_id', 'from public.test_response_versions r join public.test_responses response on response.id = r.response_id join public.submissions s on s.id = response.submission_id')
  .replace('where t.response_id = r.id', 'where t.version_id = r.id').replace('on conflict (response_id)', 'on conflict (version_id)')
  .replace('join public.test_responses r on r.id = t.response_id\n    join public.submissions s on s.id = r.submission_id', 'join public.test_response_versions r on r.id = t.version_id\n    join public.test_responses response on response.id = r.response_id\n    join public.submissions s on s.id = response.submission_id');
let finish = fn(base, 'finish_recording_transcript');
finish = finish.replace('v_source public.test_responses%rowtype;', 'v_source public.test_response_versions%rowtype;')
 .replace('select * into v_source from public.test_responses where id = p_response_id for update;', `perform 1 from public.test_responses where id = p_response_id for update;
  if not found then return false; end if;
  select v.* into v_source from public.test_response_versions v join public.recording_transcripts t on t.version_id = v.id
  where t.response_id = p_response_id and t.attempt_id = p_attempt_id for update of v;`)
 .replace('where response_id = p_response_id for update;', 'where response_id = p_response_id and version_id = v_source.id for update;')
 .replace('select 1 from public.submissions s where s.id = v_source.submission_id and s.user_id = v_transcript.owner_user_id', 'select 1 from public.submissions s join public.test_responses r on r.submission_id = s.id where r.id = v_source.response_id and s.user_id = v_transcript.owner_user_id');
let retry = fn(base, 'retry_recording_transcript');
retry = retry.replace('p_owner uuid, p_response_id uuid)', 'p_owner uuid, p_response_id uuid, p_version_id uuid default null)')
 .replace('from public.test_responses r join public.submissions s on s.id = r.submission_id', 'from public.test_response_versions r join public.test_responses response on response.id = r.response_id join public.submissions s on s.id = response.submission_id')
 .replace('r.id = t.response_id', 'r.id = t.version_id')
 .replace("and t.owner_user_id = p_owner", `and r.id = coalesce(p_version_id, (select latest.id from public.test_response_versions latest where latest.response_id = p_response_id order by version_number desc limit 1))
    and t.owner_user_id = p_owner`);
let reuse = fn(read('supabase/migrations/20260909012639_reuse_existing_recording_transcripts.sql'), 'reuse_existing_recording_transcripts');
reuse = reuse.replace('select r.id response_id,', 'select r.response_id, r.id version_id,')
 .replace('from public.test_responses r\n    join public.submissions s on s.id = r.submission_id', 'from public.test_response_versions r\n    join public.test_responses response on response.id = r.response_id\n    join public.submissions s on s.id = response.submission_id')
 .replace('old.test_response_id = r.id', 'old.test_response_id = r.response_id and r.version_number = 1')
 .replace('current.response_id = r.id', 'current.version_id = r.id')
 .replace('response_id, owner_user_id, source_bucket, source_path', 'response_id, version_id, owner_user_id, source_bucket, source_path')
 .replace('values(v_record.response_id, v_record.owner_id', 'values(v_record.response_id, v_record.version_id, v_record.owner_id')
 .replace('on conflict (response_id)', 'on conflict (version_id)')
 .replace('where response_id = v_record.response_id for update;', 'where version_id = v_record.version_id for update;');
let report = read('supabase/migrations/20260910210807_transcript_report_deltas.sql');
report = report.replaceAll('from public.submissions s join public.test_responses r on r.submission_id = s.id', 'from public.submissions s join public.test_responses response on response.submission_id = s.id join public.test_response_versions r on r.response_id = response.id')
 .replace("'responseId', r.id, 'submittedAt', r.submitted_at,", "'responseId', r.response_id, 'versionId', r.id, 'versionNumber', r.version_number, 'submittedAt', r.submitted_at,")
 .replace('from public.test_responses r join public.submissions s on s.id = r.submission_id', 'from public.test_response_versions r join public.test_responses response on response.id = r.response_id join public.submissions s on s.id = response.submission_id')
 .replace('t.response_id = r.id', 't.version_id = r.id');
fs.appendFileSync(target, '\n\n' + [claim, finish,
 'drop function public.retry_recording_transcript(uuid,uuid);', retry,
 'revoke all on function public.retry_recording_transcript(uuid,uuid,uuid) from public, anon, authenticated;\ngrant execute on function public.retry_recording_transcript(uuid,uuid,uuid) to service_role;',
 reuse, report,
 `create or replace function public.get_transcript_report_page(p_owner uuid, p_app uuid default null, p_as_of timestamptz default now(), p_after_time timestamptz default null, p_after_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public.get_transcript_report_page_delta(p_owner, p_app, p_as_of, p_after_time, p_after_id, '{}'::jsonb);
$$;`
].join('\n\n') + '\n');
