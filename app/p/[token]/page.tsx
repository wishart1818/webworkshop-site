import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProspectWebsitePreview } from "@/components/engine/ProspectWebsitePreview";
import { getPublicProspectPreview } from "@/lib/top-prospect-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Website Concept Preview",
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicProspectPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const prospect = await getPublicProspectPreview(token);
  if (!prospect) notFound();

  return <ProspectWebsitePreview prospect={prospect} publicView savedPreview={prospect.preview} />;
}
