import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderCustomerInvoicePdf } from "@/lib/invoices/customer-invoice-pdf";

type UnknownRecord = Record<string, unknown>;

type ClaimedJob = {
  job_id: string;
  lock_token: string;
  idempotency_key: string;
  channel: "email" | "pdf";
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

function html(value: unknown) {
  return string(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
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

export function createCustomerInvoiceWorkerClient() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function claim(client: SupabaseClient, workerId: string, limit: number) {
  const { data, error } = await client.rpc(
    "worker_claim_customer_invoice_delivery_jobs",
    {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: 300,
    },
  );
  if (error) throw new Error(`Fakturakön kunde inte hämtas: ${error.message}`);
  return (data ?? []) as ClaimedJob[];
}

async function loadLogo(client: SupabaseClient, invoice: UnknownRecord) {
  const branding = record(invoice.document_branding_snapshot);
  const logo = record(branding.logo);
  const bucket = string(logo.storage_bucket);
  const path = string(logo.storage_path);
  if (!bucket || !path) return null;
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) return null;
  const contentType = data.type;
  if (!new Set(["image/png", "image/jpeg"]).has(contentType)) return null;
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType };
}

async function existingPdf(client: SupabaseClient, invoice: UnknownRecord) {
  const path = string(invoice.pdf_storage_path);
  const expectedHash = string(invoice.pdf_checksum_sha256);
  if (!path || !expectedHash) return null;
  const { data, error } = await client.storage
    .from("customer-invoice-pdfs")
    .download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (sha256(bytes) !== expectedHash)
    throw new Error("Den lagrade faktura-PDF:ens kontrollhash stämmer inte");
  return { path, checksum: expectedHash, bytes };
}

async function ensurePdf(client: SupabaseClient, job: ClaimedJob) {
  const invoice = job.payload.invoice;
  const oldPdf = await existingPdf(client, invoice);
  if (oldPdf) return oldPdf;

  const bytes = await renderCustomerInvoicePdf({
    invoice,
    lines: Array.isArray(job.payload.lines) ? job.payload.lines : [],
    logo: await loadLogo(client, invoice),
  });
  const checksum = sha256(bytes);
  const path = `${job.payload.organization_id}/${job.payload.invoice_id}/${checksum}.pdf`;
  const { error: uploadError } = await client.storage
    .from("customer-invoice-pdfs")
    .upload(path, bytes, {
      contentType: "application/pdf",
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError && !/already exists|Duplicate/i.test(uploadError.message)) {
    throw new Error(`Faktura-PDF kunde inte lagras: ${uploadError.message}`);
  }
  const { error: recordError } = await client.rpc(
    "worker_record_customer_invoice_pdf",
    {
      p_job_id: job.job_id,
      p_lock_token: job.lock_token,
      p_storage_path: path,
      p_checksum_sha256: checksum,
    },
  );
  if (recordError)
    throw new Error(`PDF-beviset kunde inte låsas: ${recordError.message}`);
  return { path, checksum, bytes };
}

async function sendEmail(job: ClaimedJob, bytes: Uint8Array) {
  if (process.env.BYNEX_EMAIL_DOMAIN_VERIFIED !== "true") {
    throw new Error("Bynex e-postdomän är inte verifierad för fakturautskick");
  }
  const apiKey = required("RESEND_API_KEY");
  const fromEmail = required("BYNEX_INVOICE_FROM_EMAIL").trim().toLowerCase();
  if (!/^[^\s@]+@bynex\.se$/.test(fromEmail)) {
    throw new Error(
      "BYNEX_INVOICE_FROM_EMAIL måste vara en verifierad @bynex.se-adress",
    );
  }
  const invoice = job.payload.invoice;
  const customer = record(invoice.customer_snapshot);
  const issuer = record(invoice.issuer_snapshot);
  const recipient = string(customer.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    throw new Error("Fakturamottagarens e-postadress är ogiltig");
  const invoiceNumber = string(invoice.invoice_number);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": job.idempotency_key,
    },
    body: JSON.stringify({
      from: `Bynex Faktura <${fromEmail}>`,
      to: [recipient],
      reply_to:
        string(issuer.email) || process.env.BYNEX_BILLING_REPLY_TO || undefined,
      subject: `Faktura ${invoiceNumber} från ${string(issuer.legal_name)}`,
      html: `<div style="font-family:Arial,sans-serif;color:#202124;line-height:1.6"><h1 style="font-size:24px">Faktura ${html(invoiceNumber)}</h1><p>Hej ${html(customer.contact_name || customer.legal_name)},</p><p>Här kommer faktura <strong>${html(invoiceNumber)}</strong> från ${html(issuer.legal_name)}.</p><p>Att betala: <strong>${html(money(invoice.amount_payable))}</strong><br>Förfallodatum: <strong>${html(invoice.due_date)}</strong><br>Betalningsreferens: <strong>${html(invoice.payment_reference)}</strong></p><p>Fakturan finns bifogad som PDF.</p><hr style="border:0;border-top:1px solid #ddd"><p style="font-size:12px;color:#666">Säkert levererad med Bynex.</p></div>`,
      text: `Faktura ${invoiceNumber} från ${string(issuer.legal_name)}\n\nAtt betala: ${money(invoice.amount_payable)}\nFörfallodatum: ${string(invoice.due_date)}\nBetalningsreferens: ${string(invoice.payment_reference)}\n\nFakturan finns bifogad som PDF.`,
      attachments: [
        {
          filename: `Faktura-${invoiceNumber}.pdf`,
          content: Buffer.from(bytes).toString("base64"),
        },
      ],
      tags: [{ name: "document_type", value: "customer_invoice" }],
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
  if (!providerId)
    throw new Error("E-postleverantören returnerade inget meddelande-id");
  return providerId;
}

async function complete(
  client: SupabaseClient,
  job: ClaimedJob,
  providerMessageId: string | null,
) {
  const { error } = await client.rpc(
    "worker_complete_customer_invoice_delivery_job",
    {
      p_job_id: job.job_id,
      p_lock_token: job.lock_token,
      p_provider_message_id: providerMessageId,
    },
  );
  if (error)
    throw new Error(`Leveranskvittot kunde inte sparas: ${error.message}`);
}

async function fail(client: SupabaseClient, job: ClaimedJob, cause: unknown) {
  const message = cause instanceof Error ? cause.message : "Okänt leveransfel";
  const { error } = await client.rpc(
    "worker_fail_customer_invoice_delivery_job",
    {
      p_job_id: job.job_id,
      p_lock_token: job.lock_token,
      p_error_code: "invoice_delivery_error",
      p_error_message: message,
    },
  );
  if (error)
    throw new Error(`Leveransfelet kunde inte registreras: ${error.message}`);
}

export async function runCustomerInvoiceDelivery(input?: {
  client?: SupabaseClient;
  workerId?: string;
  limit?: number;
}) {
  const client = input?.client ?? createCustomerInvoiceWorkerClient();
  const jobs = await claim(
    client,
    input?.workerId ?? `bynex-invoice:${crypto.randomUUID()}`,
    input?.limit ?? 25,
  );
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const pdf = await ensurePdf(client, job);
      const providerId =
        job.channel === "email" ? await sendEmail(job, pdf.bytes) : null;
      await complete(client, job, providerId);
      completed += 1;
    } catch (cause) {
      await fail(client, job, cause);
      failed += 1;
    }
  }
  return { claimed: jobs.length, completed, failed };
}
