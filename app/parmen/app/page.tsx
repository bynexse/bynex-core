import type { Metadata } from "next";
import PersonalBinderWorkspace from "@/components/personal-binder/PersonalBinderWorkspace";

export const metadata: Metadata = {
  title: "Min Pärm",
  robots: { index: false, follow: false },
};

export default function PersonalBinderPage() {
  return <PersonalBinderWorkspace />;
}
