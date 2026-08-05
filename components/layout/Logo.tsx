import Image from "next/image";
import Link from "next/link";

export default function Logo({ priority = false }: { priority?: boolean }) {
  return (
    <Link href="/" aria-label="Bynex startsida" className="inline-flex overflow-hidden rounded-xl bg-[#07090d] shadow-sm">
      <Image src="/brand/bynex-wordmark.png" alt="Bynex" width={2172} height={724} priority={priority} className="h-auto w-40" />
    </Link>
  );
}
