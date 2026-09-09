import { describe, expect, it } from "vitest";
import { seededState } from "../../src/data/seeds";
import { getSubmissionSelectOptions } from "../../src/lib/selectors";

describe("Earn edit test selector", () => {
  it("includes the selected test when the owned-test list has not loaded it", () => {
    const template = seededState.submissions[0];
    const selectedSubmission = {
      ...structuredClone(template),
      id: "submission-test4test",
      productName: "Test4Test",
    };

    const options = getSubmissionSelectOptions([], selectedSubmission);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: "submission-test4test",
      productName: "Test4Test",
    });
  });

  it("does not duplicate a selected test that is already available", () => {
    const selectedSubmission = structuredClone(seededState.submissions[0]);
    const submissions = [selectedSubmission];

    expect(getSubmissionSelectOptions(submissions, selectedSubmission)).toBe(submissions);
  });
});
