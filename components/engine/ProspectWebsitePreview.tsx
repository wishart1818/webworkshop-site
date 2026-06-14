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

export function ProspectWebsitePreview({ prospect, publicView = false, savedPreview }: ProspectWebsitePreviewProps) {
  const preview = savedPreview ?? generatePreview(prospect);
  const styleProfile = previewStyleProfile(prospect, preview);
  const serviceArea = prospect.serviceArea || `${prospect.city}, ${prospect.state}`;
  const services = preview.serviceHighlights ?? preview.servicePageStructure.slice(0, 3);
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
            <small>Local {prospect.trade.toLowerCase()} service</small>
            <strong>{prospect.businessName}</strong>
            <p>Serving {serviceArea}</p>
            <span>{preview.direction}</span>
          </aside>
        </section>

        <section className="prospect-preview-trust" aria-label="Business trust highlights">
          {trustItems.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
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
                <b>0{index + 1}</b>
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
                <i aria-hidden="true"><span>{index + 1}</span></i>
                <b>{item}</b>
                <span>{prospect.city}, {prospect.state}</span>
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
