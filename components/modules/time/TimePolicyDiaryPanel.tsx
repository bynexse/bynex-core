"use client";

import TimeMissingDiaryPanel from "@/components/modules/time/TimeMissingDiaryPanel";
import TimePolicyDiaryPanelV2 from "@/components/modules/time/TimePolicyDiaryPanelV2";

export default function TimePolicyDiaryPanel({
  notify,
}: {
  notify: (message: string) => void;
}) {
  return (
    <div className="space-y-5">
      <TimePolicyDiaryPanelV2 notify={notify} />
      <TimeMissingDiaryPanel />
    </div>
  );
}
