import type {
  BillingStage,
  BillingStageAdapter,
  DigitalBinderBillingAdapters,
} from "@/lib/billing/digital-binder-delivery";

type ProviderConfig = {
  endpoint: string;
  token: string;
};

const providerEnv: Record<BillingStage, { endpoint: string; token: string }> = {
  pdf: { endpoint: "BYNEX_BILLING_PDF_ENDPOINT", token: "BYNEX_BILLING_PDF_TOKEN" },
  delivery: {
    endpoint: "BYNEX_BILLING_DELIVERY_ENDPOINT",
    token: "BYNEX_BILLING_DELIVERY_TOKEN",
  },
  bookkeeping: {
    endpoint: "BYNEX_BILLING_ACCOUNTING_ENDPOINT",
    token: "BYNEX_BILLING_ACCOUNTING_TOKEN",
  },
};

function getProviderConfig(stage: BillingStage): ProviderConfig {
  const names = providerEnv[stage];
  const endpoint = process.env[names.endpoint];
  const token = process.env[names.token];
  if (!endpoint || !token) {
    throw new Error(`Providerkonfiguration saknas för ${stage}`);
  }
  return { endpoint, token };
}

function createHttpAdapter(stage: BillingStage): BillingStageAdapter {
  return async ({ adapter, idempotencyKey, payload }) => {
    const provider = getProviderConfig(stage);
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ stage, adapter, payload }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`${stage}-providern svarade HTTP ${response.status}`);
    }
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error(`${stage}-providern returnerade ett ogiltigt svar`);
    }
    return result as Record<string, unknown>;
  };
}

export function createBillingHttpAdapters(): DigitalBinderBillingAdapters {
  return {
    pdf: createHttpAdapter("pdf"),
    delivery: createHttpAdapter("delivery"),
    bookkeeping: createHttpAdapter("bookkeeping"),
  };
}
