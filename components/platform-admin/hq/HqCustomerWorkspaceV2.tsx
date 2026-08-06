"use client";

import HqCustomerMembersPanel from "./HqCustomerMembersPanel";
import HqCustomerWorkspace from "./HqCustomerWorkspace";
import type { HqData } from "./types";
import type { RunHqAction } from "./utils";

export default function HqCustomerWorkspaceV2({
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
  return (
    <div className="space-y-5">
      <HqCustomerWorkspace
        data={data}
        selectedOrganizationId={selectedOrganizationId}
        runAction={runAction}
        busy={busy}
      />
      {selectedOrganizationId && data.selected?.organization && (
        <HqCustomerMembersPanel
          organizationId={selectedOrganizationId}
          platformRole={data.role}
        />
      )}
    </div>
  );
}
