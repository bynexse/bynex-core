import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildBynexEmail,
  requireVerifiedBynexEmail,
  resolveReplyTo,
} from "@/lib/email/bynex-email";
import { renderSubscriptionInvoicePdf } from "@/lib/invoices/subscription-invoice-pdf";

type UnknownRecord = Record<string, unknown>;

type ClaimedJob = {
  job_id: string;
  lock_token: string;
  idempotency_key: string;
  channel: "email" | "peppol";
  payload: {
    organization_id: string;
    invoice_id: string;
    invoice: UnknownRecord;
    lines: UnknownRecord[];
  };
};

function required(name: string, legacy?: string) {
  const value = process.env[name] ?? (legacy ? process.env[legacy] : undefined);
  if (!value) throw new Error(`Servermiljövariabeln ${name} saknas`);
  return value;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
      }).format(amount)
    : "";
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createSubscriptionInvoiceWorkerClient() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function claim(client: SupabaseClient, workerId: string, limit: number) {
  const { data, error } = await client.rpc(
    "worker_claim_subscription_invoice_delivery_jobs",
    {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: 300,
    },
  );
  if (error) {
    throw new Error(`Abonnemangsfakturakön kunde inte hämtas: ${error.message}`);
  }
  return (data ?? []) as ClaimedJob[];
}

async function existingPdf(client: SupabaseClient, invoice: UnknownRecord) {
  const path = string(invoice.pdf_storage_path);
  const expectedHash = string(invoice.pdf_checksum_sha256);
  if (!path || !expectedHash) return null;
  const { data, error } = await client.storage
    .from("subscription-invoice-pdfs")
    .download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (sha256(bytes) !== expectedHash) {
    throw new Error("Den lagrade abonnemangsfakturans kontrollhash stämmer inte");
  }
  return { path, checksum: expectedHash, bytes };
}

async function ensurePdf(client: SupabaseClient, job: ClaimedJob) {
  const oldPdf = await existingPdf(client, job.payload.invoice);
  if (oldPdf) return oldPdf;

  const bytes = await renderSubscriptionInvoicePdf({
    invoice: job.payload.invoice,
    lines: Array.isArray(job.payload.lines) ? job.payload.lines : [],
  });
  const checksum = sha256(bytes);
  const path = `${job.payload.organization_id}/${job.payload.invoice_id}/${checksum}.pdf`;
  const { error: uploadError } = await client.storage
    .from("subscription-invoice-pdfs")
    .upload(path, bytes, {
      contentType: "application/pdf",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError && !/already exists|Duplicate/i.test(uploadError.message)) {
    throw new Error(
      `Abonnemangsfaktura-PDF kunde inte lagras: ${uploadError.message}`,
    );
  }
  const { error: recordError } = await client.rpc(
    "worker_record_subscription_invoice_pdf",
    {
      p_job_id: job.job_id,
      p_lock_token: job.lock_token,
      p_storage_path: path,
      p_checksum_sha256: checksum,
    },
  );
  if (recordError) {
    throw new Error(`PDF-beviset kunde inte låsas: ${recordError.message}`);
  }
  return { path, checksum, bytes };
}

async function sendEmail(job: ClaimedJob, bytes: Uint8Array) {
  if (job.channel !== "email") {
    throw new Error(
      "Peppol-leverans kräver en konfigurerad Peppol-accesspunkt och behandlas inte av e-postworkern",
    );
  }

  const apiKey = required("RESEND_API_KEY");
  const fromEmail = requireVerifiedBynexEmail("BYNEX_INVOICE_FROM_EMAIL");
  const invoice = job.payload.invoice;
  const customer = record(invoice.customer_snapshot);
  const issuer = record(invoice.issuer_snapshot);
  const recipient = string(customer.billing_email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Fakturamottagarens e-postadress är ogiltig");
  }

  const creditNote = invoice.document_type === "credit_note";
  const documentLabel = creditNote ? "Kreditfaktura" : "Faktura";
  const invoiceNumber = string(invoice.invoice_number) || "utan nummer";
  const companyName = string(issuer.legal_name) || "Bynex";
  const email = buildBynexEmail({
    fromEmail,
    companyName,
    documentLabel,
    reference: invoiceNumber,
    recipientName: string(customer.contact_name || customer.legal_name),
    heading: `${documentLabel} ${invoiceNumber}`,
    message: creditNote
      ? `${companyName} har utfärdat kreditfaktura ${invoiceNumber}.`
      : `Här kommer faktura ${invoiceNumber} från ${companyName}.`,
    details: [
      {
        label: creditNote ? "Krediterat belopp" : "Att betala",
        value: money(invoice.amount_inc_vat),
      },
      ...(!creditNote
        ? [
            { label: "Förfallodatum", value: string(invoice.due_date) },
            { label: "Betalningsreferens", value: invoiceNumber },
          ]
        : [{ label: "Status", value: "Krediterad mot ursprunglig faktura" }]),
    ],
    attachmentText: `${documentLabel}n finns bifogad som en låst PDF-version.`,
    replyHint: "Har du frågor kan du svara direkt på detta meddelande.",
    footerText: `Säkert levererad genom Bynex för ${companyName}.`,
  });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": job.idempotency_key,
    },
    body: JSON.stringify({
      from: email.from,
      to: [recipient],
      reply_to: resolveReplyTo(
        issuer.email,
        process.env.BYNEX_BILLING_REPLY_TO,
      ),
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        {
          filename: `${creditNote ? "Kreditfaktura" : "Faktura"}-${invoiceNumber}.pdf`,
          content: Buffer.from(bytes).toString("base64"),
        },
      ],
      tags: [
        {
          name: "document_type",
          value: creditNote ? "subscription_credit_note" : "subscription_invoice",
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = record(result).message;
    throw new Error(
      `E-postleverantören svarade HTTP ${response.status}${message ? `: ${string(message)}` : ""}`,
    );
  }
  const providerId = string(record(result).id);
  if (!providerId) {
    throw new Error("E-postleverantören returnerade inget meddelande-id");
  }
  return providerId;
}

async function complete(
  client: SupabaseClient,
  job: ClaimedJob,
  providerMessageId: string,
) {
  const { error } = await client.rpc(
    "worker_complete_subscription_invoice_delivery_job",
    {
      p_job_id: job.job_id,
      p_lock_token: job.lock_token,
      p_provider_message_id: providerMessageId,
    },
  );
  if (error) {
    throw new Error(`Leveranskvittot kunde inte sparas: ${error.message}`);
  }
}

async function fail(client: SupabaseClient, job: ClaimedJob, cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Okänt leveransfel";
  const { error } = await client.rpc(
    "worker_fail_subscription_invoice_delivery_job",
    {
      p_job_id: job.job_id,
      p_lock_token: job.lock_token,
      p_error_code: "subscription_invoice_delivery_error",
      p_error_message: message,
    },
  );
  if (error) {
    throw new Error(`Leveransfelet kunde inte registreras: ${error.message}`);
  }
}

export async function runSubscriptionInvoiceDelivery(input?: {
  client?: SupabaseClient;
  workerId?: string;
  limit?: number;
}) {
  const client = input?.client ?? createSubscriptionInvoiceWorkerClient();
  const jobs = await claim(
    client,
    input?.workerId ?? `bynex-subscription-invoice:${crypto.randomUUID()}`,
    input?.limit ?? 25,
  );
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const pdf = await ensurePdf(client, job);
      const providerId = await sendEmail(job, pdf.bytes);
      await complete(client, job, providerId);
      completed += 1;
    } catch (cause) {
      await fail(client, job, cause);
      failed += 1;
    }
  }
  return { claimed: jobs.length, completed, failed };
}
