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

type TradeVisualProfile = {
  hero: string;
  service: string;
  proof: string;
  texture: string;
  motif: string;
  details: string[];
};

const tradeVisuals: Record<Prospect["trade"], TradeVisualProfile> = {
  Roofing: {
    hero: "Durable roofline and exterior service visual",
    service: "Roof material and inspection detail",
    proof: "Sample roof project photo slot",
    texture: "Sturdy roofline, material detail, and local exterior work",
    motif: "Roofline",
    details: ["Shingles", "Flashing", "Inspection"],
  },
  HVAC: {
    hero: "HVAC equipment, ductwork, thermostat, and home comfort visual",
    service: "Furnace, AC condenser, ductwork, vent, and thermostat detail",
    proof: "Sample HVAC equipment and service proof slot",
    texture: "Clean equipment, airflow, and reliable service cues",
    motif: "HVAC system",
    details: ["Thermostat", "AC condenser", "Ductwork"],
  },
  Landscaping: {
    hero: "Outdoor living and finished yard visual",
    service: "Planting, hardscape, and seasonal detail",
    proof: "Sample landscape project photo slot",
    texture: "Finished outdoor spaces and before-after potential",
    motif: "Outdoor plan",
    details: ["Planting", "Hardscape", "Seasonal care"],
  },
  Plumbing: {
    hero: "Practical home plumbing service visual",
    service: "Fixture, pipe, and repair detail",
    proof: "Sample plumbing work photo slot",
    texture: "Clean repair detail, response clarity, and simple next steps",
    motif: "Plumbing repair",
    details: ["Fixtures", "Pipes", "Water heater"],
  },
  Electrical: {
    hero: "Safe residential electrical service visual",
    service: "Panel, lighting, and installation detail",
    proof: "Sample electrical project photo slot",
    texture: "Sharp safety cues, clear scope, and dependable work",
    motif: "Electrical panel",
    details: ["Panel", "Lighting", "Safety"],
  },
  "Power Washing": {
    hero: "Clean exterior surface transformation visual",
    service: "Surface cleaning and soft-wash detail",
    proof: "Sample washing result photo slot",
    texture: "Before-after contrast, exterior detail, and quick quoting",
    motif: "Clean surface",
    details: ["Siding", "Concrete", "Soft wash"],
  },
  Painting: {
    hero: "Fresh exterior or interior painting visual",
    service: "Prep, color, and finish detail",
    proof: "Sample painting project photo slot",
    texture: "Clean prep, careful finish, and color confidence",
    motif: "Paint finish",
    details: ["Prep", "Color", "Trim"],
  },
  Concrete: {
    hero: "Durable concrete and flatwork visual",
    service: "Driveway, patio, and finish detail",
    proof: "Sample concrete project photo slot",
    texture: "Material strength, clean edges, and practical planning",
    motif: "Concrete layout",
    details: ["Driveway", "Patio", "Finish"],
  },
  Cleaning: {
    hero: "Bright, organized cleaning service visual",
    service: "Clean room and checklist detail",
    proof: "Sample cleaning result photo slot",
    texture: "Fresh surfaces, organized scope, and easy booking",
    motif: "Clean room",
    details: ["Checklist", "Rooms", "Schedule"],
  },
  "Tree Service": {
    hero: "Outdoor tree care and safety visual",
    service: "Crew, equipment, and cleanup detail",
    proof: "Sample tree service photo slot",
    texture: "Safety-first outdoor work and cleanup expectations",
    motif: "Tree care",
    details: ["Trimming", "Removal", "Cleanup"],
  },
  Fencing: {
    hero: "Finished fence and property boundary visual",
    service: "Material, gate, and fence-line detail",
    proof: "Sample fencing project photo slot",
    texture: "Cedar, clean lines, privacy, and property fit",
    motif: "Fence line",
    details: ["Privacy", "Gate", "Materials"],
  },
  Flooring: {
    hero: "Finished flooring and interior surface visual",
    service: "Wood, plank, and installation detail",
    proof: "Sample flooring project photo slot",
    texture: "Warm interior surfaces and clean installation detail",
    motif: "Floor pattern",
    details: ["Planks", "Refinish", "Install"],
  },
  Remodeling: {
    hero: "Finished home improvement space visual",
    service: "Material, planning, and room detail",
    proof: "Sample remodeling project photo slot",
    texture: "Finished spaces, material choices, and planning clarity",
    motif: "Room plan",
    details: ["Kitchen", "Bath", "Planning"],
  },
  "General Contractor": {
    hero: "Residential construction and project planning visual",
    service: "Build process and material detail",
    proof: "Sample construction project photo slot",
    texture: "Project progress, finished spaces, and communication clarity",
    motif: "Project build",
    details: ["Planning", "Materials", "Schedule"],
  },
};

function TradeVisualPanel({ label, slot, visual }: { label: string; slot: "hero" | "service" | "proof"; visual: TradeVisualProfile }) {
  return (
    <div aria-label={label} className={`prospect-preview-visual prospect-preview-visual--${slot}`} role="img">
      <div className="prospect-preview-visual__canvas">
        <span className="prospect-preview-visual__mark">{visual.motif}</span>
        <span className="prospect-preview-visual__line" />
        <span className="prospect-preview-visual__line" />
        <span className="prospect-preview-visual__disc" />
      </div>
      <div className="prospect-preview-visual__details" aria-hidden="true">
        {visual.details.map((detail) => <span key={detail}>{detail}</span>)}
      </div>
    </div>
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
            <TradeVisualPanel label={visual.hero} slot="hero" visual={visual} />
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
                <TradeVisualPanel label={index === 0 ? visual.service : `${item} trade-relevant service visual`} slot="service" visual={visual} />
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
                <TradeVisualPanel label={index === 0 ? visual.proof : `${item} sample layout slot`} slot="proof" visual={visual} />
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
