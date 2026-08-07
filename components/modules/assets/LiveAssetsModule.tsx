"use client";

import AssetLossWorkspace from "@/components/modules/assets/AssetLossWorkspace";
import LiveAssetsRegistry from "@/components/modules/assets/LiveAssetsRegistry";

export default function LiveAssetsModule({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="space-y-5">
      <AssetLossWorkspace notify={notify} />
      <LiveAssetsRegistry notify={notify} />
    </div>
  );
}
