export type StaffingRequirement = {
  id: string;
  requirement_type: "skill" | "certificate";
  name: string;
  minimum_level: "learning" | "qualified" | "expert" | null;
  mandatory: boolean;
  weight: number;
};

export type StaffingWorker = {
  id: string;
  full_name: string;
  job_title: string | null;
  skills: Array<{ name: string; level: "learning" | "qualified" | "expert" }>;
  certificates: Array<{ name: string; status: string; valid_from: string | null; valid_until: string | null }>;
  unavailable: boolean;
  assignmentConflicts: number;
};

export type StaffingCandidate = {
  workerId: string;
  fullName: string;
  jobTitle: string | null;
  eligible: boolean;
  score: number;
  matchedRequirements: number;
  totalRequirements: number;
  assignmentConflicts: number;
  explanations: string[];
};

const skillRank = { learning: 1, qualified: 2, expert: 3 } as const;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("sv-SE");
}

function overlapsEntirePeriod(
  certificate: StaffingWorker["certificates"][number],
  startsOn: string,
  endsOn: string,
) {
  if (!["valid", "expiring"].includes(certificate.status)) return false;
  if (certificate.valid_from && certificate.valid_from > startsOn) return false;
  if (certificate.valid_until && certificate.valid_until < endsOn) return false;
  return true;
}

export function matchStaffingCandidates({
  requirements,
  workers,
  startsOn,
  endsOn,
}: {
  requirements: StaffingRequirement[];
  workers: StaffingWorker[];
  startsOn: string;
  endsOn: string;
}) {
  const totalWeight = requirements.reduce((sum, requirement) => sum + requirement.weight, 0);

  return workers.map<StaffingCandidate>((worker) => {
    const explanations: string[] = [];
    let matchedWeight = 0;
    let matchedRequirements = 0;
    let mandatoryMissing = false;

    for (const requirement of requirements) {
      const requirementName = normalized(requirement.name);
      let matched = false;

      if (requirement.requirement_type === "skill") {
        const skill = worker.skills.find((item) => normalized(item.name) === requirementName);
        const minimum = requirement.minimum_level ?? "qualified";
        matched = Boolean(skill && skillRank[skill.level] >= skillRank[minimum]);
      } else {
        const certificate = worker.certificates.find((item) => normalized(item.name) === requirementName);
        matched = Boolean(certificate && overlapsEntirePeriod(certificate, startsOn, endsOn));
      }

      if (matched) {
        matchedWeight += requirement.weight;
        matchedRequirements += 1;
        explanations.push(`Matchar ${requirement.requirement_type === "skill" ? "kompetensen" : "intyget"} ${requirement.name}.`);
      } else {
        if (requirement.mandatory) mandatoryMissing = true;
        explanations.push(`${requirement.mandatory ? "Saknar obligatoriskt" : "Saknar önskvärt"} ${requirement.requirement_type === "skill" ? "kompetenskrav" : "giltigt intyg"}: ${requirement.name}.`);
      }
    }

    if (worker.unavailable) explanations.push("Inte tillgänglig under hela eller delar av perioden.");
    if (worker.assignmentConflicts > 0) explanations.push(`${worker.assignmentConflicts} annan aktiv projekttilldelning överlappar perioden.`);
    else explanations.push("Ingen annan projekttilldelning överlappar perioden.");

    const competencyScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 75 : 0;
    const availabilityScore = worker.unavailable ? 0 : Math.max(0, 25 - worker.assignmentConflicts * 10);
    const eligible = !mandatoryMissing && !worker.unavailable;

    return {
      workerId: worker.id,
      fullName: worker.full_name,
      jobTitle: worker.job_title,
      eligible,
      score: Math.round(competencyScore + availabilityScore),
      matchedRequirements,
      totalRequirements: requirements.length,
      assignmentConflicts: worker.assignmentConflicts,
      explanations,
    };
  }).sort((left, right) => Number(right.eligible) - Number(left.eligible) || right.score - left.score || left.fullName.localeCompare(right.fullName, "sv-SE"));
}
