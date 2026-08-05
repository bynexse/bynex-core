import assert from "node:assert/strict";
import { normalizeCertificateStatus, validatedOptionalText } from "../../lib/people/qualifications.ts";

assert.equal(normalizeCertificateStatus({
  requestedStatus: "valid",
  validFrom: "2026-01-01",
  validUntil: "2026-08-03",
  today: "2026-08-04",
}), "expired", "Passerat slutdatum får aldrig bli giltigt.");

assert.equal(normalizeCertificateStatus({
  requestedStatus: "valid",
  validFrom: "2026-08-20",
  validUntil: "2027-08-20",
  today: "2026-08-04",
}), "pending", "Framtida startdatum ska invänta giltighet.");

assert.equal(normalizeCertificateStatus({
  requestedStatus: "valid",
  validFrom: "2025-01-01",
  validUntil: "2026-09-20",
  today: "2026-08-04",
}), "expiring", "Högst 60 dagar kvar ska märkas förnyas snart.");

assert.equal(normalizeCertificateStatus({
  requestedStatus: "valid",
  validFrom: "2025-01-01",
  validUntil: "2027-01-01",
  today: "2026-08-04",
}), "valid");

assert.deepEqual(validatedOptionalText(" Utfärdare AB ", 20), { valid: true, value: "Utfärdare AB" });
assert.deepEqual(validatedOptionalText("för långt", 3), { valid: false, value: null });

console.log("Kompetenser och intyg: datumstatus och textvalidering godkända.");
