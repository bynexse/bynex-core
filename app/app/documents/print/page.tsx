import { PrintableDocumentView } from "@/components/documents/PrintableDocumentView";

export default async function PrintableDocumentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const kind = typeof params.kind === "string" ? params.kind : "";
  const id = typeof params.id === "string" ? params.id : "";
  return <PrintableDocumentView kind={kind} id={id} />;
}
