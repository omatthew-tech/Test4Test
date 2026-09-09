import type { ProductType, Submission } from "../types";
import { normalizeProductTypes } from "./format";
import { requireSupabase } from "./supabase";

export interface HomeTrustedSubmission {
  id: string;
  productName: string;
  productTypes: ProductType[];
  description: string;
}

interface HomeTrustedSubmissionRow {
  id: string;
  product_name: string;
  product_types: string[] | null;
  description: string | null;
}

function mapHomeTrustedSubmission(row: HomeTrustedSubmissionRow): HomeTrustedSubmission {
  const productTypes = (row.product_types ?? []).filter(
    (productType): productType is ProductType =>
      productType === "website" || productType === "ios" || productType === "android",
  );

  return {
    id: row.id,
    productName: row.product_name,
    productTypes: normalizeProductTypes(productTypes),
    description: row.description ?? "",
  };
}

export async function loadHomeTrustedSubmissions() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_home_trusted_submissions");

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as HomeTrustedSubmissionRow[]).map(mapHomeTrustedSubmission);
}

export function selectFixtureHomeTrustedSubmissions(submissions: Submission[]) {
  return submissions
    .filter(
      (submission) =>
        submission.status === "live" &&
        submission.isOpenForMoreTests &&
        submission.rewardType === "credit" &&
        !submission.needsGooglePlayClosedTesters,
    )
    .sort((first, second) => {
      if (first.promoted !== second.promoted) {
        return first.promoted ? -1 : 1;
      }

      if (first.responseCount !== second.responseCount) {
        return first.responseCount - second.responseCount;
      }

      return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
    })
    .slice(0, 6)
    .map((submission) => ({
      id: submission.id,
      productName: submission.productName,
      productTypes: submission.productTypes,
      description: submission.description,
    }));
}
