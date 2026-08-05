import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { renderCustomerInvoicePdf } from "../../lib/invoices/customer-invoice-pdf.ts";

const invoice = {
  invoice_number: "BYX-0001000",
  invoice_kind: "standard",
  invoice_date: "2026-08-05",
  due_date: "2026-09-04",
  issued_at: "2026-08-05T10:00:00.000Z",
  amount_ex_vat: 1000,
  vat_amount: 250,
  amount_payable: 1250,
  requested_tax_deduction_amount: 0,
  payment_reference: "BYX-0001000",
  customer_snapshot: {
    legal_name: "Åkeri & Bygg AB",
    address_line1: "Byvägen 1",
    postal_code: "111 22",
    city: "Stockholm",
  },
  issuer_snapshot: {
    legal_name: "C Alsbjer",
    organization_number: "910120-1391",
    vat_number: "SE910120139101",
    approved_for_f_tax: true,
    bankgiro: "433-1625",
  },
  document_branding_snapshot: { invoice_footer: "Tack för förtroendet" },
};

test("fakturarenderaren skapar en läsbar PDF med låst metadata", async () => {
  const bytes = await renderCustomerInvoicePdf({
    invoice,
    lines: [
      {
        line_number: 1,
        description: "Byggtjänst åäö",
        quantity: 2,
        unit: "tim",
        unit_price_ex_vat: 500,
        line_amount_ex_vat: 1000,
      },
    ],
  });
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString("ascii"), "%PDF");
  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getTitle(), "Faktura BYX-0001000");
  assert.equal(loaded.getAuthor(), "C Alsbjer");
  assert.equal(loaded.getPageCount(), 1);
});

test("långa fakturor pagineras och oväntade tecken stoppar inte PDF", async () => {
  const lines = Array.from({ length: 85 }, (_, index) => ({
    line_number: index + 1,
    description: `Materialrad ${index + 1} 🔨 med en längre beskrivning`,
    quantity: 1,
    unit: "st",
    unit_price_ex_vat: 10,
    line_amount_ex_vat: 10,
  }));
  const bytes = await renderCustomerInvoicePdf({
    invoice: {
      ...invoice,
      amount_ex_vat: 850,
      vat_amount: 212.5,
      amount_payable: 1062.5,
    },
    lines,
  });
  const loaded = await PDFDocument.load(bytes);
  assert(loaded.getPageCount() >= 3);
});
