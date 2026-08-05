import assert from "node:assert/strict";
import { matchStaffingCandidates } from "../../lib/staffing/match.ts";

const requirements = [
  {
    id: "skill-electrician",
    requirement_type: "skill",
    name: "Elinstallation",
    minimum_level: "qualified",
    mandatory: true,
    weight: 10,
  },
  {
    id: "certificate-lift",
    requirement_type: "certificate",
    name: "Liftkort",
    minimum_level: null,
    mandatory: true,
    weight: 10,
  },
];

function worker(overrides) {
  return {
    id: overrides.id,
    full_name: overrides.full_name,
    job_title: "Elektriker",
    skills: [{ name: "Elinstallation", level: "expert" }],
    certificates: [{
      name: "Liftkort",
      status: "valid",
      valid_from: "2026-01-01",
      valid_until: "2027-01-01",
    }],
    unavailable: false,
    assignmentConflicts: 0,
    ...overrides,
  };
}

const candidates = matchStaffingCandidates({
  requirements,
  startsOn: "2026-09-01",
  endsOn: "2026-09-30",
  workers: [
    worker({ id: "available", full_name: "Anna Tillgänglig" }),
    worker({ id: "conflict", full_name: "Bo Upptagen", assignmentConflicts: 1 }),
    worker({
      id: "expired",
      full_name: "Cecilia Utgånget",
      certificates: [{ name: "Liftkort", status: "expired", valid_from: "2025-01-01", valid_until: "2026-08-31" }],
    }),
    worker({ id: "unavailable", full_name: "David Frånvarande", unavailable: true }),
  ],
});

assert.deepEqual(candidates.map((candidate) => candidate.workerId), ["available", "conflict", "unavailable", "expired"]);
const byId = new Map(candidates.map((candidate) => [candidate.workerId, candidate]));
assert.equal(byId.get("available")?.score, 100);
assert.equal(byId.get("conflict")?.score, 90);
assert.equal(byId.get("expired")?.eligible, false, "Utgånget obligatoriskt intyg ska diskvalificera.");
assert.equal(byId.get("unavailable")?.eligible, false, "Otillgänglighet ska diskvalificera för vald period.");
assert.ok(byId.get("conflict")?.explanations.some((text) => text.includes("överlappar")));
assert.ok(candidates.flatMap((candidate) => candidate.explanations).every((text) => !/sjuk|vab|medicin/i.test(text)));

console.log("Bemanningspoäng: kompetens, intyg, tidskrock och integritet godkända.");
