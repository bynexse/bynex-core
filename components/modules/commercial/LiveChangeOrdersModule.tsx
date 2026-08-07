"use client";

import BynexChangeOrdersWorkspace from "./BynexChangeOrdersWorkspace";
import ChangeOrderDeliveryRecovery from "./ChangeOrderDeliveryRecovery";
import ChangeOrderLifecycleQueue from "./ChangeOrderLifecycleQueue";

export default function LiveChangeOrdersModule({
  notify,
}: {
  notify: (message: string) => void;
}) {
  return (
    <div className="space-y-5">
      <ChangeOrderDeliveryRecovery notify={notify} />
      <ChangeOrderLifecycleQueue notify={notify} />
      <BynexChangeOrdersWorkspace notify={notify} />
    </div>
  );
}
