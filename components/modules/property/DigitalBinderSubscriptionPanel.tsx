"use client";

import CustomerSharedFilesPanel from "@/components/modules/property/CustomerSharedFilesPanel";
import DigitalBinderSubscriptionCommercePanel from "@/components/modules/property/DigitalBinderSubscriptionCommercePanel";

export default function DigitalBinderSubscriptionPanel() {
  return (
    <div className="space-y-6">
      <CustomerSharedFilesPanel />
      <DigitalBinderSubscriptionCommercePanel />
    </div>
  );
}
