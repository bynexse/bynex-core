"use client";

import OrganizationLaborPricing from "./OrganizationLaborPricing";
import OrganizationSeatManager from "./OrganizationSeatManager";

export default function OrganizationStaffWorkspace() {
  return (
    <div className="space-y-6">
      <OrganizationSeatManager />
      <OrganizationLaborPricing />
    </div>
  );
}
