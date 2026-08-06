"use client";

import HqCustomerPersonnelPanel from "./HqCustomerPersonnelPanel";
import HqCustomerWorkspaceBase from "./HqCustomerWorkspaceBase";
import type { HqData } from "./types";
import { asText, record, type RunHqAction } from "./utils";

export default function HqCustomerWorkspace({
  data,
  selectedOrganizationId,
  runAction,
  busy,
}: {
  data: HqData;
  selectedOrganizationId: string | null;
  runAction: RunHqAction;
  busy: boolean;
}) {
  const organization = record(data.selected?.organization);

  return (
    <div className="space-y-5">
      <HqCustomerWorkspaceBase
        data={data}
        selectedOrganizationId={selectedOrganizationId}
        runAction={runAction}
        busy={busy}
      />

      {selectedOrganizationId && data.selected?.organization && (
        <HqCustomerPersonnelPanel
          organizationId={selectedOrganizationId}
          organizationName={asText(organization.name, "Kundföretaget")}
          platformRole={data.role}
        />
      )}
    </div>
  );
}
