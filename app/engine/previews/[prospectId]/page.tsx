import { notFound } from "next/navigation";
import { generatePreview } from "@/lib/prospect-engine";
import { getProspect } from "@/lib/prospect-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ProspectPreviewPage({ params }: { params: Promise<{ prospectId: string }> }) {
  const { prospectId } = await params;
  const prospect = await getProspect(prospectId);
  if (!prospect) notFound();
  const preview = prospect.preview ?? generatePreview(prospect);
  const primaryService = preview.homepageStructure[1] ?? `${prospect.trade} services`;

  return (
    <main className="prospect-site-preview">
      <header><a href="/engine">Back to Prospect Engine</a><span>Protected concept preview · Not a live client website</span></header>
      <nav><strong>{prospect.businessName}</strong><div><a href="#services">Services</a><a href="#work">Our work</a><a href="#contact">Contact</a></div><a href="#contact">Request an estimate</a></nav>
      <section className="prospect-preview-hero">
        <div><span>Serving {prospect.serviceArea || `${prospect.city}, ${prospect.state}`}</span><h1>{prospect.trade} work built around your home and your timeline.</h1><p>{preview.hero}</p><div><a href="#contact">Request an estimate</a>{prospect.phone && <a href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>}</div></div>
        <aside><small>Local service</small><strong>{prospect.businessName}</strong><p>{preview.direction}</p></aside>
      </section>
      <section className="prospect-preview-trust"><span>Clear estimates</span><span>Local project proof</span><span>Responsive service</span><span>Homeowner-first process</span></section>
      <section className="prospect-preview-section" id="services"><span>Services</span><h2>Practical help, explained clearly.</h2><p>{primaryService}</p><div className="prospect-preview-cards">{preview.servicePageStructure.slice(0, 3).map((item, index) => <article key={item}><b>0{index + 1}</b><h3>{item}</h3><p>Clear scope, practical next steps, and the proof homeowners need to move forward.</p></article>)}</div></section>
      <section className="prospect-preview-work" id="work"><div><span>Recent work</span><h2>Show the outcome, not just the service list.</h2><p>{preview.portfolioDirection}</p></div><div>{["Local project story", "Before and after", "Scope and outcome"].map((item) => <article key={item}><i /><b>{item}</b><span>{prospect.city}, {prospect.state}</span></article>)}</div></section>
      <section className="prospect-preview-section prospect-preview-contact" id="contact"><div><span>Start a conversation</span><h2>A shorter path to the right estimate.</h2><p>{preview.leadCaptureStrategy}</p></div><form><label>Name<input disabled /></label><label>Phone<input disabled /></label><label>How can we help?<textarea disabled /></label><button disabled>Request an estimate</button></form></section>
      <footer><strong>{prospect.businessName}</strong><span>{prospect.trade} · {prospect.city}, {prospect.state}</span><span>Concept prepared for manual review in WebWorkshop Prospect Engine.</span></footer>
    </main>
  );
}
