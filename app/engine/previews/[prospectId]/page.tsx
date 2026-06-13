import { notFound } from "next/navigation";
import { ProspectWebsitePreview } from "@/components/engine/ProspectWebsitePreview";
import { getProspect } from "@/lib/prospect-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ProspectPreviewPage({ params }: { params: Promise<{ prospectId: string }> }) {
  const { prospectId } = await params;
  const prospect = await getProspect(prospectId);
  if (!prospect) notFound();

  return <ProspectWebsitePreview prospect={prospect} savedPreview={prospect.preview} />;
}
