import { timingSafeEqual } from "node:crypto";
import { createBillingHttpAdapters } from "@/lib/billing/http-adapters";
import { runDigitalBinderBillingPipeline } from "@/lib/billing/digital-binder-delivery";

export const runtime = "nodejs";

function authorized(request: Request) {
  const expected = process.env.BYNEX_BILLING_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDigitalBinderBillingPipeline({
      adapters: createBillingHttpAdapters(),
      workerId: `bynex-smart:${crypto.randomUUID()}`,
      limit: 50,
    });
    return Response.json(result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Okänt workerfel";
    return Response.json({ error: message }, { status: 503 });
  }
}
