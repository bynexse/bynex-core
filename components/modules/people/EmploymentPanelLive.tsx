"use client";

import EmploymentPanel from "./EmploymentPanel";
import PayrollSettingsPanel from "./PayrollSettingsPanel";

export default function EmploymentPanelLive({
  workerId,
  employmentType,
  notify,
}: {
  workerId: string;
  employmentType: string;
  notify: (message: string) => void;
}) {
  return (
    <>
      <div className="[&>div:nth-of-type(4)]:hidden [&>div:nth-of-type(5)]:hidden">
        <EmploymentPanel
          workerId={workerId}
          employmentType={employmentType}
          notify={notify}
        />
      </div>
      <PayrollSettingsPanel
        workerId={workerId}
        employmentType={employmentType}
        notify={notify}
      />
    </>
  );
}
