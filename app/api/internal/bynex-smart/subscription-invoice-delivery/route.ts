import { timingSafeEqual } from "node:crypto";
import { runSubscriptionInvoiceDelivery } from "@/lib/invoices/subscription-invoice-delivery";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = process.env.BYNEX_INVOICE_WORKER_SECRET;
  const supplied = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await runSubscriptionInvoiceDelivery({ limit: 25 }));
  } catch (cause) {
    const message =
      cause instanceof Error
        ? cause.message
        : "Okänt abonnemangsfakturaworkerfel";
    return Response.json({ error: message }, { status: 503 });
  }
}
