import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const billingStages = ["pdf", "delivery", "bookkeeping"] as const;

export type BillingStage = (typeof billingStages)[number];

type ClaimedBillingJob = {
  job_id: string;
  lock_token: string;
  adapter: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
};

type AdapterResult = Record<string, unknown>;

export type BillingStageAdapter = (input: {
  adapter: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}) => Promise<AdapterResult>;

export type DigitalBinderBillingAdapters = Record<BillingStage, BillingStageAdapter>;

function requiredServerEnv(name: string, legacyName?: string) {
  const value = process.env[name] ?? (legacyName ? process.env[legacyName] : undefined);
  if (!value) throw new Error(`Servermiljövariabeln ${name} saknas`);
  return value;
}

export function createBillingWorkerClient() {
  const url = requiredServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requiredServerEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function queueDigitalBinderBilling(client: SupabaseClient, limit = 1000) {
  const { data, error } = await client.rpc(
    "worker_queue_digital_binder_billing",
    { p_limit: limit },
  );
  if (error) throw new Error(`Kunde inte köa Digitalpärmens fakturor: ${error.message}`);
  return Array.isArray(data) ? data.length : 0;
}

async function claimJobs(
  client: SupabaseClient,
  stage: BillingStage,
  workerId: string,
  limit: number,
) {
  const { data, error } = await client.rpc(
    "worker_claim_bynex_billing_delivery_jobs",
    {
      p_stage: stage,
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: 300,
    },
  );
  if (error) throw new Error(`Kunde inte hämta ${stage}-jobb: ${error.message}`);
  return (data ?? []) as ClaimedBillingJob[];
}

async function completeJob(
  client: SupabaseClient,
  job: ClaimedBillingJob,
  result: AdapterResult,
) {
  const { error } = await client.rpc(
    "worker_complete_bynex_billing_delivery_job",
    { p_job_id: job.job_id, p_lock_token: job.lock_token, p_result: result },
  );
  if (error) throw new Error(`Kunde inte slutföra fakturajobb: ${error.message}`);
}

async function failJob(client: SupabaseClient, job: ClaimedBillingJob, cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Okänt adapterfel";
  const { error } = await client.rpc(
    "worker_fail_bynex_billing_delivery_job",
    {
      p_job_id: job.job_id,
      p_lock_token: job.lock_token,
      p_error_code: "adapter_error",
      p_error_message: message,
      p_retry_after_seconds: 300,
    },
  );
  if (error) throw new Error(`Kunde inte registrera fakturajobbets fel: ${error.message}`);
}

export async function runDigitalBinderBillingStage(input: {
  client: SupabaseClient;
  stage: BillingStage;
  adapter: BillingStageAdapter;
  workerId: string;
  limit?: number;
}) {
  const jobs = await claimJobs(
    input.client,
    input.stage,
    input.workerId,
    input.limit ?? 25,
  );
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await input.adapter({
        adapter: job.adapter,
        idempotencyKey: job.idempotency_key,
        payload: job.payload,
      });
      await completeJob(input.client, job, result);
      completed += 1;
    } catch (cause) {
      await failJob(input.client, job, cause);
      failed += 1;
    }
  }

  return { claimed: jobs.length, completed, failed };
}

export async function runDigitalBinderBillingPipeline(input: {
  client?: SupabaseClient;
  adapters: DigitalBinderBillingAdapters;
  workerId: string;
  limit?: number;
}) {
  const client = input.client ?? createBillingWorkerClient();
  const queued = await queueDigitalBinderBilling(client, input.limit ?? 1000);
  const results = {} as Record<BillingStage, Awaited<ReturnType<typeof runDigitalBinderBillingStage>>>;

  // PDF must complete before delivery can be claimed. Bookkeeping is an
  // independent issuance event and is safe to process in the same invocation.
  for (const stage of billingStages) {
    results[stage] = await runDigitalBinderBillingStage({
      client,
      stage,
      adapter: input.adapters[stage],
      workerId: input.workerId,
      limit: input.limit,
    });
  }

  return { queued, stages: results };
}
