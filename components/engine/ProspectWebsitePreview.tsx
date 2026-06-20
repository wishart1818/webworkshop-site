import Image from "next/image";
import React, { type CSSProperties } from "react";
import {
  generatePreview,
  previewStyleProfile,
  type PreviewConcept,
  type Prospect,
} from "@/lib/prospect-engine";

type ProspectWebsitePreviewProps = {
  prospect: Prospect;
  publicView?: boolean;
  savedPreview?: PreviewConcept;
};

type ProspectPreviewProperties = CSSProperties & {
  "--prospect-primary": string;
  "--prospect-accent": string;
  "--prospect-surface": string;
  "--prospect-soft": string;
  "--prospect-ink": string;
  "--prospect-muted": string;
  "--prospect-line": string;
  "--prospect-heading-font": string;
  "--prospect-body-font": string;
};

type TradeVisualAsset = {
  src: string;
  alt: string;
};

type TradeVisualProfile = {
  hero: TradeVisualAsset;
  service: TradeVisualAsset;
  proof: TradeVisualAsset;
  texture: string;
};

const tradeVisuals: Record<Prospect["trade"], TradeVisualProfile> = {
  Roofing: {
    hero: { src: "/engine-preview-assets/trades/roofing-hero.svg", alt: "Roofing concept visual with roofline, shingle detail, and inspection cues" },
    service: { src: "/engine-preview-assets/trades/roofing-service.svg", alt: "Roofing service visual with shingles, roof repair, and inspection equipment" },
    proof: { src: "/engine-preview-assets/trades/roofing-proof.svg", alt: "Sample roofing project proof visual with roof inspection and shingle details" },
    texture: "Sturdy roofline, material detail, and local exterior work",
  },
  HVAC: {
    hero: { src: "/engine-preview-assets/trades/hvac-hero.svg", alt: "HVAC concept visual with an AC condenser, thermostat, ductwork, and home comfort equipment" },
    service: { src: "/engine-preview-assets/trades/hvac-service.svg", alt: "HVAC service visual with thermostat, condenser, ductwork, and equipment details" },
    proof: { src: "/engine-preview-assets/trades/hvac-proof.svg", alt: "Sample HVAC project proof visual with air handler, condenser, and ductwork cues" },
    texture: "Clean equipment, airflow, and reliable service cues",
  },
  Landscaping: {
    hero: { src: "/engine-preview-assets/trades/landscaping-hero.svg", alt: "Landscaping concept visual with lawn, garden beds, hardscape, and outdoor space cues" },
    service: { src: "/engine-preview-assets/trades/landscaping-service.svg", alt: "Landscaping service visual with planting, patio, lawn, and maintenance details" },
    proof: { src: "/engine-preview-assets/trades/landscaping-proof.svg", alt: "Sample landscaping project proof visual with outdoor living and yard improvement cues" },
    texture: "Finished outdoor spaces and before-after potential",
  },
  Plumbing: {
    hero: { src: "/engine-preview-assets/trades/plumbing-hero.svg", alt: "Plumbing concept visual with sink, pipes, fixture, and water service details" },
    service: { src: "/engine-preview-assets/trades/plumbing-service.svg", alt: "Plumbing service visual with pipe repair, fixture, and water heater cues" },
    proof: { src: "/engine-preview-assets/trades/plumbing-proof.svg", alt: "Sample plumbing project proof visual with water heater, fixture, and pipe details" },
    texture: "Clean repair detail, response clarity, and simple next steps",
  },
  Electrical: {
    hero: { src: "/engine-preview-assets/trades/electrical-hero.svg", alt: "Electrical concept visual with breaker panel, outlet, wiring, and lighting cues" },
    service: { src: "/engine-preview-assets/trades/electrical-service.svg", alt: "Electrical service visual with outlets, breaker panel, wiring, and lighting details" },
    proof: { src: "/engine-preview-assets/trades/electrical-proof.svg", alt: "Sample electrical project proof visual with light fixture, panel, and wiring cues" },
    texture: "Sharp safety cues, clear scope, and dependable work",
  },
  "Power Washing": {
    hero: { src: "/engine-preview-assets/trades/power-washing-hero.svg", alt: "Power washing concept visual with spray wand, siding, and cleaned exterior surfaces" },
    service: { src: "/engine-preview-assets/trades/power-washing-service.svg", alt: "Power washing service visual with siding wash, spray equipment, and driveway cleaning cues" },
    proof: { src: "/engine-preview-assets/trades/power-washing-proof.svg", alt: "Sample power washing proof visual with cleaned driveway and exterior surface details" },
    texture: "Before-after contrast, exterior detail, and quick quoting",
  },
  Painting: {
    hero: { src: "/engine-preview-assets/trades/painting-hero.svg", alt: "Painting concept visual with paint roller, wall finish, trim, and refresh cues" },
    service: { src: "/engine-preview-assets/trades/painting-service.svg", alt: "Painting service visual with trim, roller, paint tray, and finish details" },
    proof: { src: "/engine-preview-assets/trades/painting-proof.svg", alt: "Sample painting project proof visual with paint tray, roller, and finished trim cues" },
    texture: "Clean prep, careful finish, and color confidence",
  },
  Concrete: {
    hero: { src: "/engine-preview-assets/trades/concrete-hero.svg", alt: "Concrete concept visual with driveway, walkway, and flatwork finishing details" },
    service: { src: "/engine-preview-assets/trades/concrete-service.svg", alt: "Concrete service visual with trowel, driveway, walkway, and finish cues" },
    proof: { src: "/engine-preview-assets/trades/concrete-proof.svg", alt: "Sample concrete project proof visual with walkway, driveway, and finish detail" },
    texture: "Material strength, clean edges, and practical planning",
  },
  Cleaning: {
    hero: { src: "/engine-preview-assets/trades/cleaning-hero.svg", alt: "Cleaning concept visual with clean interior, equipment, and organized service cues" },
    service: { src: "/engine-preview-assets/trades/cleaning-service.svg", alt: "Cleaning service visual with supplies, clean room, checklist, and equipment details" },
    proof: { src: "/engine-preview-assets/trades/cleaning-proof.svg", alt: "Sample cleaning proof visual with fresh interior and cleaning equipment cues" },
    texture: "Fresh surfaces, organized scope, and easy booking",
  },
  "Tree Service": {
    hero: { src: "/engine-preview-assets/trades/tree-service-hero.svg", alt: "Tree service concept visual with tree trimming, equipment, and cleanup cues" },
    service: { src: "/engine-preview-assets/trades/tree-service-service.svg", alt: "Tree service visual with trimming, removal equipment, and yard cleanup details" },
    proof: { src: "/engine-preview-assets/trades/tree-service-proof.svg", alt: "Sample tree service proof visual with equipment, trimming, and cleanup cues" },
    texture: "Safety-first outdoor work and cleanup expectations",
  },
  Fencing: {
    hero: { src: "/engine-preview-assets/trades/fencing-hero.svg", alt: "Fencing concept visual with fence panels, gate, and yard boundary cues" },
    service: { src: "/engine-preview-assets/trades/fencing-service.svg", alt: "Fencing service visual with gate, fence line, materials, and yard details" },
    proof: { src: "/engine-preview-assets/trades/fencing-proof.svg", alt: "Sample fencing project proof visual with installed fence, gate, and yard cues" },
    texture: "Cedar, clean lines, privacy, and property fit",
  },
  Flooring: {
    hero: { src: "/engine-preview-assets/trades/flooring-hero.svg", alt: "Flooring concept visual with hardwood planks, tile, and installation details" },
    service: { src: "/engine-preview-assets/trades/flooring-service.svg", alt: "Flooring service visual with tile, planks, installation tools, and finished surface cues" },
    proof: { src: "/engine-preview-assets/trades/flooring-proof.svg", alt: "Sample flooring project proof visual with installed floor, tile, and plank details" },
    texture: "Warm interior surfaces and clean installation detail",
  },
  Remodeling: {
    hero: { src: "/engine-preview-assets/trades/remodeling-hero.svg", alt: "Remodeling concept visual with kitchen, bath, room planning, and material cues" },
    service: { src: "/engine-preview-assets/trades/remodeling-service.svg", alt: "Remodeling service visual with bath, kitchen, planning, and room improvement details" },
    proof: { src: "/engine-preview-assets/trades/remodeling-proof.svg", alt: "Sample remodeling project proof visual with room plan, kitchen, bath, and material cues" },
    texture: "Finished spaces, material choices, and planning clarity",
  },
  "General Contractor": {
    hero: { src: "/engine-preview-assets/trades/general-contractor-hero.svg", alt: "General contractor concept visual with framing, materials, blueprint, and construction planning cues" },
    service: { src: "/engine-preview-assets/trades/general-contractor-service.svg", alt: "General contractor service visual with blueprint, framing, materials, and build process details" },
    proof: { src: "/engine-preview-assets/trades/general-contractor-proof.svg", alt: "Sample construction project proof visual with materials, framing, and planning cues" },
    texture: "Project progress, finished spaces, and communication clarity",
  },
};

function TradeVisualImage({ asset, slot }: { asset: TradeVisualAsset; slot: "hero" | "service" | "proof" }) {
  return (
    <figure className={`prospect-preview-image prospect-preview-image--${slot}`} data-preview-image-slot={slot}>
      <Image
        alt={asset.alt}
        src={asset.src}
        width={960}
        height={720}
        priority={slot === "hero"}
        unoptimized
      />
    </figure>
  );
}

export function ProspectWebsitePreview({ prospect, publicView = false, savedPreview }: ProspectWebsitePreviewProps) {
  const preview = savedPreview ?? generatePreview(prospect);
  const styleProfile = previewStyleProfile(prospect, preview);
  const serviceArea = prospect.serviceArea || `${prospect.city}, ${prospect.state}`;
  const services = preview.serviceHighlights ?? preview.servicePageStructure.slice(0, 3);
  const visual = tradeVisuals[prospect.trade];
  const trustItems = preview.trustItems ?? [
    `Serving ${prospect.city}, ${prospect.state}`,
    prospect.phone ? "Direct phone contact" : "Clear contact path",
    "Services explained clearly",
    "Simple estimate next step",
  ];
  const noWebsiteProspect = prospect.prospectType === "no_website_social_only";
  const style = {
    "--prospect-primary": styleProfile.primaryColor,
    "--prospect-accent": styleProfile.accentColor,
    "--prospect-surface": styleProfile.surfaceColor,
    "--prospect-soft": styleProfile.softSurfaceColor,
    "--prospect-ink": styleProfile.inkColor,
    "--prospect-muted": styleProfile.mutedTextColor,
    "--prospect-line": styleProfile.borderColor,
    "--prospect-heading-font": styleProfile.headingFont,
    "--prospect-body-font": styleProfile.bodyFont,
  } as ProspectPreviewProperties;

  return (
    <main className="prospect-site-preview protected-prospect-preview" data-preview-access={publicView ? "public" : "internal"}>
      <header className="concept-preview-disclosure">
        {publicView ? <span>Concept preview. Not a live client website.</span> : <a href="/engine">Back to Prospect Engine</a>}
        {!publicView && <span>Protected concept preview. Not a live client website.</span>}
      </header>

      <div
        className="prospect-preview-site"
        data-layout={styleProfile.layoutStyle}
        data-tone={styleProfile.tone}
        style={style}
      >
        <nav className="prospect-preview-nav" aria-label={`${prospect.businessName} concept navigation`}>
          <a className="prospect-preview-brand" href="#top">{prospect.businessName}</a>
          <div>
            <a href="#services">Services</a>
            <a href="#work">Our work</a>
            <a href="#contact">Contact</a>
          </div>
          <a className="prospect-preview-button" href="#contact">{styleProfile.ctaLabel}</a>
        </nav>

        <section className="prospect-preview-hero" id="top">
          <div className="prospect-preview-hero__content">
            <span className="prospect-preview-kicker">{prospect.trade} in {prospect.city}, {prospect.state}</span>
            <h1>{preview.heroHeadline ?? `${prospect.trade} work built around your home and your timeline.`}</h1>
            <p>{preview.heroSupporting ?? preview.hero}</p>
            <div className="prospect-preview-actions">
              <a className="prospect-preview-button" href="#contact">{styleProfile.ctaLabel}</a>
              {prospect.phone
                ? <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>
                : <a className="prospect-preview-text-link" href="#services">Explore services</a>}
            </div>
          </div>
          <aside className="prospect-preview-hero__visual">
            <TradeVisualImage asset={visual.hero} slot="hero" />
            <div className="prospect-preview-visual-caption">
              <small>Sample visual direction</small>
              <strong>{visual.texture}</strong>
              <span>Trade-relevant concept visual. Replace with verified {prospect.businessName} photos before launch.</span>
            </div>
          </aside>
        </section>

        <section className="prospect-preview-trust" aria-label="Business trust highlights">
          {trustItems.slice(0, 4).map((item) => <span key={item}><b>{item}</b><i>Useful detail for a faster decision</i></span>)}
        </section>

        <section className="prospect-preview-section prospect-preview-services" id="services">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Services</span>
            <h2>Clear help for the work your property needs.</h2>
            <p>{preview.hero}</p>
          </div>
          <div className="prospect-preview-service-list">
            {services.map((item, index) => (
              <article key={item}>
                <TradeVisualImage asset={index === 0 ? visual.service : visual.hero} slot="service" />
                <div>
                  <h3>{item}</h3>
                  <p>Understand the scope, practical next steps, and what to expect before the work begins.</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="prospect-preview-why">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Why choose us</span>
            <h2>Useful proof, placed where it builds confidence.</h2>
            <p>{preview.trustStrategy}</p>
          </div>
          <div>
            {trustItems.slice(0, 3).map((item) => (
              <article key={item}>
                <span aria-hidden="true">{item.slice(0, 1)}</span>
                <h3>{item}</h3>
                <p>Clear, factual information that helps a homeowner understand the business and take the next step.</p>
              </article>
            ))}
          </div>
        </section>

        <section className="prospect-preview-work" id="work">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">{noWebsiteProspect ? "Project proof concept" : "Recent local work"}</span>
            <h2>{noWebsiteProspect ? "A clear place for verified work." : "Proof that makes the next decision easier."}</h2>
            <p>{preview.portfolioDirection}</p>
          </div>
          <div className="prospect-preview-projects">
            {(noWebsiteProspect ? ["Verified project story", "Approved project photos", "Confirmed scope and outcome"] : ["Local project story", "Before and after", "Scope and outcome"]).map((item, index) => (
              <article key={item}>
                <TradeVisualImage asset={index === 0 ? visual.proof : visual.service} slot="proof" />
                <b>{item}</b>
                <span>Sample layout content. Use verified photos, locations, scope, and outcomes supplied by the business.</span>
              </article>
            ))}
          </div>
        </section>

        <section className="prospect-preview-service-area">
          <span className="prospect-preview-kicker">Service area</span>
          <h2>Local service, clearly defined.</h2>
          <p>{prospect.businessName} serves {serviceArea}. Contact the team to confirm availability for your property and project.</p>
          {prospect.phone && <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>}
        </section>

        <section className="prospect-preview-contact" id="contact">
          <div>
            <span className="prospect-preview-kicker">Start a conversation</span>
            <h2>A simple path to the right next step.</h2>
            <p>{preview.leadCaptureStrategy}</p>
          </div>
          <form>
            <label>Name<input disabled /></label>
            <label>Phone<input disabled /></label>
            <label>How can we help?<textarea disabled /></label>
            <button disabled>{styleProfile.ctaLabel}</button>
          </form>
        </section>

        <footer className="prospect-preview-footer">
          <strong>{prospect.businessName}</strong>
          <span>{prospect.trade} · {serviceArea}</span>
          {prospect.phone && <a href={`tel:${prospect.phone}`}>{prospect.phone}</a>}
        </footer>
      </div>
    </main>
  );
}
