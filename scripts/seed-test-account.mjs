import { randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const knownArgs = new Set(["--apply", "--dry-run", "--help", "--list"]);
const unknownArgs = process.argv.slice(2).filter((arg) => !knownArgs.has(arg));
const applyChanges = args.has("--apply");
const dryRun = !applyChanges;

if (args.has("--help") || unknownArgs.length > 0) {
  if (unknownArgs.length > 0) {
    console.error(`Unknown argument: ${unknownArgs.join(", ")}`);
  }

  console.log(`
Usage: node scripts/seed-test-account.mjs [--dry-run|--list|--apply]

Required env:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY

Required only with --apply:
  TEST_ACCOUNT_PASSWORD

Optional env:
  TEST_ACCOUNT_EMAIL=test@test4test.io
  TEST_ACCOUNT_DISPLAY_NAME="Test Account"
  TEST_ACCOUNT_SOURCE_EMAIL=matt.ozoroski@gmail.com
  TEST_ACCOUNT_PRODUCT_NAME=MastoMetrics
`);
  process.exit(unknownArgs.length > 0 ? 1 : 0);
}

const sourceEmail = normalizeEmail(process.env.TEST_ACCOUNT_SOURCE_EMAIL ?? "matt.ozoroski@gmail.com");
const productName = process.env.TEST_ACCOUNT_PRODUCT_NAME?.trim() || "MastoMetrics";
const testAccountEmail = normalizeEmail(
  process.env.TEST_ACCOUNT_EMAIL ?? process.env.VITE_TEST_ACCOUNT_EMAIL ?? "test@test4test.io",
);
const testAccountDisplayName = process.env.TEST_ACCOUNT_DISPLAY_NAME?.trim() || "Test Account";
const testAccountPassword = process.env.TEST_ACCOUNT_PASSWORD?.trim() ?? "";
const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || "";

if (!supabaseUrl) {
  fail("Missing SUPABASE_URL or VITE_SUPABASE_URL.");
}

if (!serviceRoleKey) {
  fail("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.");
}

if (applyChanges && !testAccountPassword) {
  fail("Missing TEST_ACCOUNT_PASSWORD. Refusing to create/update the Auth user without a password.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

async function main() {
  console.log(`${dryRun ? "Dry run" : "Apply"}: seed test account fixture`);
  console.log(`Source user: ${sourceEmail}`);
  console.log(`Source product: ${productName}`);
  console.log(`Target test account: ${testAccountEmail}`);

  const sourceProfile = await getProfileByEmail(sourceEmail);
  const sourceFixture = await findSourceFixture(sourceProfile.id);
  const selectedResponses = sourceFixture.responses;
  const targetAuthUser = await findAuthUserByEmail(testAccountEmail);
  const existingTargetFixtureIds = targetAuthUser
    ? await findTargetFixtureIds(targetAuthUser.id)
    : [];
  const responseInsertOwnerId = await findEligibleResponseInsertOwnerId([
    targetAuthUser?.id,
    sourceProfile.id,
  ]);

  console.log("");
  console.log(`Source profile id: ${sourceProfile.id}`);
  console.log(`Source submission id: ${sourceFixture.submission.id}`);
  console.log(`Source submission created: ${sourceFixture.submission.created_at ?? "(unknown)"}`);
  console.log(`Selected playable responses: ${selectedResponses.length}`);

  for (const response of selectedResponses) {
    console.log(
      `- ${response.id} | ${response.recording_bucket}/${response.recording_path} | expires ${response.recording_expires_at}`,
    );
  }

  console.log("");
  console.log(targetAuthUser ? `Existing target auth user: ${targetAuthUser.id}` : "Target auth user: will be created");
  console.log(`Prior target ${productName} fixtures to delete: ${existingTargetFixtureIds.length}`);
  console.log(`Temporary response-insert owner: ${responseInsertOwnerId}`);

  if (dryRun) {
    console.log("");
    console.log("No changes made. Re-run with --apply to create/update the account and clone the fixture.");
    return;
  }

  const testAuthUser = await upsertTestAuthUser(targetAuthUser);
  await upsertTestProfile(testAuthUser.id);
  await deletePriorTargetFixtures(testAuthUser.id);

  const fixture = await cloneFixture({
    sourceSubmission: sourceFixture.submission,
    sourceSubmissionVersions: sourceFixture.submissionVersions,
    sourceQuestionSets: sourceFixture.questionSets,
    sourceResponses: selectedResponses,
    targetUserId: testAuthUser.id,
    responseInsertOwnerId,
  });

  console.log("");
  console.log(`Seeded auth user: ${testAuthUser.id}`);
  console.log(`Seeded paused submission: ${fixture.submissionId}`);
  console.log(`Seeded responses: ${fixture.responseIds.join(", ")}`);
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertSupabase(error, message) {
  if (error) {
    throw new Error(`${message}: ${error.message}`);
  }
}

function isPlayableRecordingResponse(response) {
  const bucket = typeof response.recording_bucket === "string" ? response.recording_bucket.trim() : "";
  const path = typeof response.recording_path === "string" ? response.recording_path.trim() : "";
  const expiresAt = Date.parse(response.recording_expires_at ?? "");

  return Boolean(
    bucket &&
      path &&
      response.recording_deleted_at === null &&
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now(),
  );
}

function cloneRow(row, overrides, omittedKeys = []) {
  const omitted = new Set(["id", ...omittedKeys]);
  const clone = {};

  for (const [key, value] of Object.entries(row)) {
    if (!omitted.has(key)) {
      clone[key] = value;
    }
  }

  return {
    ...clone,
    ...overrides,
  };
}

async function getProfileByEmail(email) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  assertSupabase(error, `Could not load profile for ${email}`);

  if (!data) {
    throw new Error(`No profile found for ${email}.`);
  }

  return data;
}

async function findSourceFixture(sourceUserId) {
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("user_id", sourceUserId)
    .eq("product_name", productName)
    .order("created_at", { ascending: false });

  assertSupabase(error, `Could not load source ${productName} submissions`);

  for (const submission of submissions ?? []) {
    const responses = await getPlayableRecordingResponses(submission.id);

    if (responses.length >= 2) {
      const [submissionVersions, questionSets] = await Promise.all([
        getSubmissionVersions(submission.id),
        getQuestionSets(submission.id),
      ]);

      return {
        submission,
        submissionVersions,
        questionSets,
        responses: responses.slice(0, 2),
      };
    }
  }

  throw new Error(
    `No ${productName} source submission owned by ${sourceEmail} has at least two non-deleted, unexpired recording responses.`,
  );
}

async function getPlayableRecordingResponses(submissionId) {
  const { data, error } = await supabase
    .from("test_responses")
    .select("*")
    .eq("submission_id", submissionId)
    .not("recording_bucket", "is", null)
    .not("recording_path", "is", null)
    .not("recording_expires_at", "is", null)
    .is("recording_deleted_at", null)
    .gt("recording_expires_at", new Date().toISOString())
    .order("submitted_at", { ascending: false })
    .limit(10);

  assertSupabase(error, `Could not load recording responses for submission ${submissionId}`);

  return (data ?? []).filter(isPlayableRecordingResponse).slice(0, 2);
}

async function getSubmissionVersions(submissionId) {
  const { data, error } = await supabase
    .from("submission_versions")
    .select("*")
    .eq("submission_id", submissionId)
    .order("version_number", { ascending: true });

  assertSupabase(error, `Could not load submission versions for ${submissionId}`);
  return data ?? [];
}

async function getQuestionSets(submissionId) {
  const { data, error } = await supabase
    .from("question_set_versions")
    .select("*")
    .eq("submission_id", submissionId)
    .order("version_number", { ascending: true });

  assertSupabase(error, `Could not load question set versions for ${submissionId}`);
  return data ?? [];
}

async function findAuthUserByEmail(email) {
  const perPage = 1000;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    assertSupabase(error, `Could not list Auth users while looking for ${email}`);

    const user = data.users.find((candidate) => normalizeEmail(candidate.email ?? "") === email);

    if (user) {
      return user;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  throw new Error("Stopped after scanning 100,000 Auth users without finding the target.");
}

async function findTargetFixtureIds(targetUserId) {
  const { data, error } = await supabase
    .from("submissions")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("product_name", productName);

  assertSupabase(error, `Could not load existing target ${productName} fixtures`);
  return (data ?? []).map((row) => row.id);
}

async function userHasCompletedCreditedTest(userId) {
  if (!userId) {
    return false;
  }

  const { data, error } = await supabase
    .from("test_responses")
    .select("id")
    .eq("tester_user_id", userId)
    .eq("status", "approved")
    .eq("credit_awarded", true)
    .limit(1);

  assertSupabase(error, `Could not check credited-test status for ${userId}`);
  return (data ?? []).length > 0;
}

async function findEligibleResponseInsertOwnerId(candidateIds) {
  for (const candidateId of candidateIds.filter(Boolean)) {
    if (await userHasCompletedCreditedTest(candidateId)) {
      return candidateId;
    }
  }

  const { data, error } = await supabase
    .from("test_responses")
    .select("tester_user_id")
    .not("tester_user_id", "is", null)
    .eq("status", "approved")
    .eq("credit_awarded", true)
    .limit(1);

  assertSupabase(error, "Could not find any eligible temporary response-insert owner");

  const fallbackOwnerId = data?.[0]?.tester_user_id;

  if (!fallbackOwnerId) {
    throw new Error(
      "No user with a completed credited test exists, so the database response-insert trigger would reject the fixture responses.",
    );
  }

  return fallbackOwnerId;
}

async function upsertTestAuthUser(existingUser) {
  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password: testAccountPassword,
      email_confirm: true,
      user_metadata: {
        display_name: testAccountDisplayName,
      },
    });

    assertSupabase(error, `Could not update Auth user ${testAccountEmail}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: testAccountEmail,
    password: testAccountPassword,
    email_confirm: true,
    user_metadata: {
      display_name: testAccountDisplayName,
    },
  });

  assertSupabase(error, `Could not create Auth user ${testAccountEmail}`);
  return data.user;
}

async function upsertTestProfile(userId) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        email: testAccountEmail,
        display_name: testAccountDisplayName,
      },
      { onConflict: "id" },
    );

  assertSupabase(error, `Could not upsert profile for ${testAccountEmail}`);
}

async function deletePriorTargetFixtures(targetUserId) {
  const fixtureIds = await findTargetFixtureIds(targetUserId);

  if (fixtureIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("submissions")
    .delete()
    .in("id", fixtureIds);

  assertSupabase(error, `Could not delete prior ${productName} fixtures for ${testAccountEmail}`);
}

async function cloneFixture({
  sourceSubmission,
  sourceSubmissionVersions,
  sourceQuestionSets,
  sourceResponses,
  targetUserId,
  responseInsertOwnerId,
}) {
  const latestSubmittedAt = sourceResponses[0]?.submitted_at ?? null;
  const submissionPayload = cloneRow(sourceSubmission, {
    user_id: responseInsertOwnerId,
    status: "paused",
    response_count: sourceResponses.length,
    last_response_at: latestSubmittedAt,
    public_share_slug: null,
    public_share_message: null,
    promoted: false,
  });
  let clonedSubmissionId = null;

  try {
    const { data: clonedSubmission, error: submissionError } = await supabase
      .from("submissions")
      .insert(submissionPayload)
      .select("*")
      .single();

    assertSupabase(submissionError, "Could not insert cloned submission");
    clonedSubmissionId = clonedSubmission.id;

    const submissionVersionIdMap = await cloneSubmissionVersions(
      sourceSubmissionVersions,
      clonedSubmission.id,
    );
    const questionSetIdMap = await cloneQuestionSets(sourceQuestionSets, clonedSubmission.id);
    const responseIds = await cloneResponses({
      sourceResponses,
      clonedSubmissionId: clonedSubmission.id,
      submissionVersionIdMap,
      questionSetIdMap,
    });

    const { error: ownerUpdateError } = await supabase
      .from("submissions")
      .update({
        user_id: targetUserId,
        status: "paused",
        response_count: sourceResponses.length,
        last_response_at: latestSubmittedAt,
        public_share_slug: null,
        public_share_message: null,
      })
      .eq("id", clonedSubmission.id);

    assertSupabase(ownerUpdateError, "Could not transfer cloned submission to the test account");

    return {
      submissionId: clonedSubmission.id,
      responseIds,
    };
  } catch (error) {
    if (clonedSubmissionId) {
      const { error: cleanupError } = await supabase
        .from("submissions")
        .delete()
        .eq("id", clonedSubmissionId);

      if (cleanupError) {
        console.error(`Could not clean up partial cloned submission ${clonedSubmissionId}: ${cleanupError.message}`);
      }
    }

    throw error;
  }
}

async function cloneSubmissionVersions(sourceSubmissionVersions, clonedSubmissionId) {
  if (sourceSubmissionVersions.length === 0) {
    throw new Error("The source submission has no submission versions to clone.");
  }

  const payloads = sourceSubmissionVersions.map((version) =>
    cloneRow(version, { submission_id: clonedSubmissionId }),
  );
  const { data, error } = await supabase
    .from("submission_versions")
    .insert(payloads)
    .select("*");

  assertSupabase(error, "Could not clone submission versions");

  const insertedByVersionNumber = new Map((data ?? []).map((version) => [version.version_number, version.id]));
  return new Map(
    sourceSubmissionVersions.map((version) => [
      version.id,
      insertedByVersionNumber.get(version.version_number),
    ]),
  );
}

async function cloneQuestionSets(sourceQuestionSets, clonedSubmissionId) {
  if (sourceQuestionSets.length === 0) {
    throw new Error("The source submission has no question-set versions to clone.");
  }

  const payloads = sourceQuestionSets.map((questionSet) =>
    cloneRow(questionSet, { submission_id: clonedSubmissionId }),
  );
  const { data, error } = await supabase
    .from("question_set_versions")
    .insert(payloads)
    .select("*");

  assertSupabase(error, "Could not clone question-set versions");

  const insertedByVersionNumber = new Map((data ?? []).map((questionSet) => [questionSet.version_number, questionSet.id]));
  return new Map(
    sourceQuestionSets.map((questionSet) => [
      questionSet.id,
      insertedByVersionNumber.get(questionSet.version_number),
    ]),
  );
}

async function cloneResponses({
  sourceResponses,
  clonedSubmissionId,
  submissionVersionIdMap,
  questionSetIdMap,
}) {
  const nowIso = new Date().toISOString();
  const payloads = sourceResponses.map((response, index) => {
    const submissionVersionId = submissionVersionIdMap.get(response.submission_version_id);
    const questionSetVersionId = questionSetIdMap.get(response.question_set_version_id);

    if (!submissionVersionId || !questionSetVersionId) {
      throw new Error(`Could not map version ids for response ${response.id}.`);
    }

    return cloneRow(response, {
      submission_id: clonedSubmissionId,
      tester_user_id: null,
      public_tester_key: `test-account-fixture-${index + 1}-${randomUUID()}`,
      submission_version_id: submissionVersionId,
      question_set_version_id: questionSetVersionId,
      credit_awarded: false,
      affects_test_back_rate: false,
      owner_notified_at: nowIso,
    });
  });

  const { data, error } = await supabase
    .from("test_responses")
    .insert(payloads)
    .select("id");

  assertSupabase(error, "Could not clone test responses");
  return (data ?? []).map((response) => response.id);
}
