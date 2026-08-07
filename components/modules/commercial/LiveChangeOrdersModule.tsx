"use client";

import BynexChangeOrdersWorkspace from "./BynexChangeOrdersWorkspace";
import ChangeOrderDeliveryRecovery from "./ChangeOrderDeliveryRecovery";

export default function LiveChangeOrdersModule({
  notify,
}: {
  notify: (message: string) => void;
}) {
  return (
    <div className="space-y-5">
      <ChangeOrderDeliveryRecovery notify={notify} />
      <BynexChangeOrdersWorkspace notify={notify} />
    </div>
  );
}
