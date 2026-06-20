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
  fallbackSrc: string;
  alt: string;
};

type TradeVisualProfile = {
  hero: TradeVisualAsset;
  service: TradeVisualAsset;
  proof: TradeVisualAsset;
  texture: string;
};

function tradePhotoAsset(slug: string, slot: "hero" | "service" | "proof", alt: string): TradeVisualAsset {
  return {
    src: `/engine-preview-assets/trade-photos/${slug}-${slot}.jpg`,
    fallbackSrc: `/engine-preview-assets/trades/${slug}-${slot}.svg`,
    alt,
  };
}

const tradeVisuals: Record<Prospect["trade"], TradeVisualProfile> = {
  Roofing: {
    hero: tradePhotoAsset("roofing", "hero", "Representative roofing photo with roofline, shingle detail, gutter edge, and inspection context"),
    service: tradePhotoAsset("roofing", "service", "Representative roofing service photo with shingles, flashing, gutter edge, and inspection tools"),
    proof: tradePhotoAsset("roofing", "proof", "Representative roofing example photo with roof inspection and repair context"),
    texture: "Roofline, shingle detail, and practical inspection cues",
  },
  HVAC: {
    hero: tradePhotoAsset("hvac", "hero", "Representative HVAC photo with an outdoor AC condenser beside a residential home"),
    service: tradePhotoAsset("hvac", "service", "Representative HVAC service photo with furnace or air handler equipment and technician tools"),
    proof: tradePhotoAsset("hvac", "proof", "Representative HVAC example photo with thermostat, vent, and home comfort detail"),
    texture: "AC equipment, home comfort details, and service-call context",
  },
  Landscaping: {
    hero: tradePhotoAsset("landscaping", "hero", "Representative landscaping photo with lawn, planting beds, patio edge, and outdoor service context"),
    service: tradePhotoAsset("landscaping", "service", "Representative landscaping service photo with planting bed, mulch, edging, and hand tools"),
    proof: tradePhotoAsset("landscaping", "proof", "Representative landscaping example photo with finished patio edge, lawn, shrubs, and outdoor living space"),
    texture: "Lawn, planting detail, and finished outdoor space",
  },
  Plumbing: {
    hero: tradePhotoAsset("plumbing", "hero", "Representative plumbing photo with under-sink service, visible pipes, and repair tools"),
    service: tradePhotoAsset("plumbing", "service", "Representative plumbing service photo with water heater, pipe fittings, and service tools"),
    proof: tradePhotoAsset("plumbing", "proof", "Representative plumbing example photo with repaired drain trap, supply lines, and service tools"),
    texture: "Clean repair detail, water systems, and practical service cues",
  },
  Electrical: {
    hero: tradePhotoAsset("electrical", "hero", "Representative electrical photo with residential breaker panel service and insulated tools"),
    service: tradePhotoAsset("electrical", "service", "Representative electrical service photo with breaker panel, tools, and safe work context"),
    proof: tradePhotoAsset("electrical", "proof", "Representative electrical example photo with lighting installation, tools, and clean work area"),
    texture: "Breaker panels, lighting work, and safe installation cues",
  },
  "Power Washing": {
    hero: tradePhotoAsset("power-washing", "hero", "Representative power washing photo with spray equipment and exterior cleaning context"),
    service: tradePhotoAsset("power-washing", "service", "Representative power washing service photo with siding wash and surface cleaning detail"),
    proof: tradePhotoAsset("power-washing", "proof", "Representative power washing example photo with cleaned driveway and exterior surface detail"),
    texture: "Exterior cleaning, surface detail, and before-after potential",
  },
  Painting: {
    hero: tradePhotoAsset("painting", "hero", "Representative painting photo with roller, wall finish, trim, and room refresh context"),
    service: tradePhotoAsset("painting", "service", "Representative painting service photo with trim, roller, paint tray, and careful prep"),
    proof: tradePhotoAsset("painting", "proof", "Representative painting example photo with finish detail, roller, and clean trim"),
    texture: "Prep, finish detail, and color confidence",
  },
  Concrete: {
    hero: tradePhotoAsset("concrete", "hero", "Representative concrete photo with driveway, walkway, and flatwork context"),
    service: tradePhotoAsset("concrete", "service", "Representative concrete service photo with trowel, surface finish, and flatwork detail"),
    proof: tradePhotoAsset("concrete", "proof", "Representative concrete example photo with walkway, driveway, and finished surface"),
    texture: "Concrete surfaces, clean edges, and practical planning",
  },
  Cleaning: {
    hero: tradePhotoAsset("cleaning", "hero", "Representative cleaning photo with clean interior, equipment, and organized service context"),
    service: tradePhotoAsset("cleaning", "service", "Representative cleaning service photo with supplies, clean room, and equipment"),
    proof: tradePhotoAsset("cleaning", "proof", "Representative cleaning example photo with fresh interior and cleaning equipment"),
    texture: "Fresh surfaces, equipment, and organized scope",
  },
  "Tree Service": {
    hero: tradePhotoAsset("tree-service", "hero", "Representative tree service photo with tree care, trimming context, and outdoor equipment"),
    service: tradePhotoAsset("tree-service", "service", "Representative tree service photo with trimming, removal equipment, and cleanup context"),
    proof: tradePhotoAsset("tree-service", "proof", "Representative tree service example photo with equipment, trimming, and yard cleanup"),
    texture: "Tree care, equipment, and cleanup expectations",
  },
  Fencing: {
    hero: tradePhotoAsset("fencing", "hero", "Representative fencing photo with fence panels, gate, and yard boundary context"),
    service: tradePhotoAsset("fencing", "service", "Representative fencing service photo with gate, fence line, materials, and yard detail"),
    proof: tradePhotoAsset("fencing", "proof", "Representative fencing example photo with installed fence, gate, and yard context"),
    texture: "Fence lines, gates, privacy, and property fit",
  },
  Flooring: {
    hero: tradePhotoAsset("flooring", "hero", "Representative flooring photo with hardwood planks, tile, and installation context"),
    service: tradePhotoAsset("flooring", "service", "Representative flooring service photo with tile, planks, installation tools, and finished surface"),
    proof: tradePhotoAsset("flooring", "proof", "Representative flooring example photo with installed floor, tile, and plank detail"),
    texture: "Floor surfaces, installation detail, and interior finish",
  },
  Remodeling: {
    hero: tradePhotoAsset("remodeling", "hero", "Representative remodeling photo with kitchen, bath, room planning, and material context"),
    service: tradePhotoAsset("remodeling", "service", "Representative remodeling service photo with bath, kitchen, planning, and room improvement detail"),
    proof: tradePhotoAsset("remodeling", "proof", "Representative remodeling example photo with room plan, kitchen, bath, and material detail"),
    texture: "Finished spaces, materials, and planning clarity",
  },
  "General Contractor": {
    hero: tradePhotoAsset("general-contractor", "hero", "Representative construction photo with framing, materials, blueprint, and project planning context"),
    service: tradePhotoAsset("general-contractor", "service", "Representative general contractor service photo with blueprint, framing, materials, and build process detail"),
    proof: tradePhotoAsset("general-contractor", "proof", "Representative construction example photo with materials, framing, and planning context"),
    texture: "Project progress, materials, and communication clarity",
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
        data-fallback-src={asset.fallbackSrc}
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
              <small>Representative image direction</small>
              <strong>{visual.texture}</strong>
              <span>Representative trade image. Replace with verified {prospect.businessName} photos before launch.</span>
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
