import React, { type CSSProperties } from "react";
import { TradePreviewImage, type PreviewImageRenderSlot } from "@/components/engine/TradePreviewImage";
import {
  displayStateCode,
  displayTradeCategory,
  generatePreview,
  normalizeTradeCategory,
  previewStyleProfile,
  titleCaseLocation,
  type PreviewConcept,
  type Prospect,
} from "@/lib/prospect-engine";
import { resolvePreviewImages, type ResolvedPreviewImage } from "@/lib/preview-image-resolver";

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

type TradeServiceCard = {
  title: string;
  description: string;
};

type TradeProcessCopy = {
  title: string;
  description: string;
};

type TradePageCopy = {
  heroHeadline: string;
  servicesHeadline: string;
  servicesIntro: string;
  services: [TradeServiceCard, TradeServiceCard, TradeServiceCard];
};

const tradePageCopy: Record<Prospect["trade"], TradePageCopy> = {
  Roofing: { heroHeadline: "Straight answers when your roof needs attention.", servicesHeadline: "Roofing help built around the condition of your home.", servicesIntro: "Start with the roof concern, understand the work involved, and request an estimate for the property.", services: [
    { title: "Roof repair", description: "Address leaks, damaged shingles, flashing, and other focused roof concerns." },
    { title: "Full roof replacement", description: "Plan material choices, project scope, and a clear estimate for a larger roofing project." },
    { title: "Storm damage response", description: "Document visible concerns and request an inspection after wind, hail, or severe weather." },
  ] },
  HVAC: { heroHeadline: "Heating and cooling help without the runaround.", servicesHeadline: "Heating and cooling service for repairs, installs, and seasonal care.", servicesIntro: "Whether comfort is out now or a system upgrade is ahead, homeowners can describe the issue and request the right service.", services: [
    { title: "Heating and cooling repair", description: "Troubleshoot comfort problems, airflow issues, unusual sounds, and systems that stop running." },
    { title: "System installation", description: "Compare replacement or new-system options around the home, comfort goals, and project scope." },
    { title: "Maintenance and tune-ups", description: "Plan seasonal system checks, filter and airflow review, and routine equipment care." },
  ] },
  Plumbing: { heroHeadline: "Plumbing help that gets to the point.", servicesHeadline: "Practical help for leaks, drains, fixtures, and water heaters.", servicesIntro: "Share the issue, the room or fixture involved, and how soon the property needs service.", services: [
    { title: "Leak and drain repair", description: "Share the location, symptoms, and urgency of leaks, clogs, or slow drains." },
    { title: "Fixture installation", description: "Plan faucet, sink, toilet, and fixture work with the right property details." },
    { title: "Water heater service", description: "Request repair or replacement help for hot-water and equipment concerns." },
  ] },
  Electrical: { heroHeadline: "Safe electrical help for repairs and planned upgrades.", servicesHeadline: "Electrical work for everyday issues and bigger home updates.", servicesIntro: "Describe the repair, upgrade, or installation need so the right electrical work can be estimated.", services: [
    { title: "Electrical repair", description: "Request help for outlets, switches, circuits, and other electrical issues." },
    { title: "Panel and service upgrades", description: "Plan capacity, panel, and service changes around the property and project scope." },
    { title: "Lighting and new circuits", description: "Discuss lighting, dedicated circuits, and installation needs before scheduling." },
  ] },
  Landscaping: { heroHeadline: "A better outdoor space starts with a clear plan.", servicesHeadline: "Landscaping shaped around the property and the season.", servicesIntro: "From planting beds to ongoing care, the work starts with the yard, the season, and the way the space is used.", services: [
    { title: "Landscape design", description: "Shape planting, layout, and outdoor-use ideas around the property." },
    { title: "Installation", description: "Plan beds, plants, edging, and hardscape details with a defined scope." },
    { title: "Seasonal maintenance", description: "Organize recurring care, cleanups, and seasonal property needs." },
  ] },
  "Pressure Washing": { heroHeadline: "Exterior cleaning that makes the difference easy to see.", servicesHeadline: "Pressure washing for the surfaces people notice first.", servicesIntro: "Wash away buildup from siding, concrete, patios, and other exterior surfaces around the home.", services: [
    { title: "House washing", description: "Wash away dirt, algae, and buildup from siding, trim, brick, stucco, and other home exterior surfaces." },
    { title: "Concrete cleaning", description: "Refresh driveways, walkways, patios, and other residential concrete areas with focused surface cleaning." },
    { title: "Roof and soft washing", description: "Use a gentler exterior-cleaning approach for roof areas and other surfaces that need lower pressure." },
  ] },
  Painting: { heroHeadline: "A cleaner finish begins with careful preparation.", servicesHeadline: "Painting services organized around the space and scope.", servicesIntro: "Give homeowners a clear way to discuss rooms, surfaces, timing, and finish goals.", services: [
    { title: "Interior painting", description: "Plan rooms, walls, ceilings, colors, and preparation needs." },
    { title: "Exterior painting", description: "Discuss siding, trim, condition, access, and weather-sensitive timing." },
    { title: "Cabinet and trim painting", description: "Focus on detailed surfaces where preparation and finish quality matter." },
  ] },
  Concrete: { heroHeadline: "Concrete work planned for the way the property is used.", servicesHeadline: "Durable flatwork with a clearer project path.", servicesIntro: "Organize the project around dimensions, access, finish, and intended use.", services: [
    { title: "Driveways", description: "Discuss replacement or new driveway scope, access, and approximate size." },
    { title: "Patios and walkways", description: "Plan usable outdoor flatwork around layout, edges, and finish." },
    { title: "Flatwork repair", description: "Identify cracked, settled, or damaged areas that may need focused work." },
  ] },
  Cleaning: { heroHeadline: "Cleaning service with the scope clear before the visit.", servicesHeadline: "The right cleaning plan for the home and schedule.", servicesIntro: "Share the rooms, timing, and level of cleaning needed so the visit starts with clear expectations.", services: [
    { title: "Recurring cleaning", description: "Set expectations for frequency, priority rooms, and routine home care." },
    { title: "Deep cleaning", description: "Request a more detailed reset for kitchens, bathrooms, and high-use spaces." },
    { title: "Move-in and move-out cleaning", description: "Plan an empty-home clean around timing, access, and property size." },
  ] },
  "Tree Service": { heroHeadline: "Tree care with safety and cleanup in view.", servicesHeadline: "Clear options for trimming, removal, and storm concerns.", servicesIntro: "Help property owners describe the tree, location, urgency, and access before a crew is scheduled.", services: [
    { title: "Tree trimming", description: "Discuss limbs, clearance, tree health concerns, and property access." },
    { title: "Tree removal", description: "Share the tree location, nearby structures, and removal scope." },
    { title: "Storm cleanup", description: "Request help for damaged limbs, fallen trees, and urgent property hazards." },
  ] },
  Fencing: { heroHeadline: "A fence plan that fits the property and the purpose.", servicesHeadline: "Fencing options made easier to compare.", servicesIntro: "Organize the conversation around materials, boundaries, access, and gate needs.", services: [
    { title: "Privacy fencing", description: "Compare materials, height, layout, and the level of privacy needed." },
    { title: "Fence repair", description: "Address damaged panels, posts, hardware, and leaning sections." },
    { title: "Gates and access", description: "Plan pedestrian, driveway, and equipment access around the property." },
  ] },
  Flooring: { heroHeadline: "Flooring choices explained around the room and the use.", servicesHeadline: "Installation and repair options for the floors underfoot.", servicesIntro: "Help homeowners compare materials, room conditions, timing, and preparation.", services: [
    { title: "Floor installation", description: "Plan rooms, materials, transitions, and preparation for a new floor." },
    { title: "Hardwood refinishing", description: "Discuss wear, finish goals, room access, and the existing floor condition." },
    { title: "Floor repair", description: "Focus on damaged boards, tiles, transitions, or smaller problem areas." },
  ] },
  Remodeling: { heroHeadline: "A remodeling conversation that starts with the real scope.", servicesHeadline: "Home improvements organized around space, timing, and priorities.", servicesIntro: "Make it easier to share the project idea and understand whether the fit is right.", services: [
    { title: "Kitchen remodeling", description: "Discuss layout, surfaces, storage, fixtures, and project priorities." },
    { title: "Bathroom remodeling", description: "Plan fixtures, finishes, layout changes, and practical daily use." },
    { title: "Basement and interior updates", description: "Define the rooms, goals, and level of improvement needed." },
  ] },
  "General Contractor": { heroHeadline: "A clearer start for larger home projects.", servicesHeadline: "Construction planning built around the actual scope.", servicesIntro: "Give property owners a useful path to discuss timing, budget range, and project fit.", services: [
    { title: "Renovations", description: "Define the existing space, intended changes, and project priorities." },
    { title: "Additions", description: "Start with location, use, approximate size, and planning considerations." },
    { title: "Project coordination", description: "Organize the moving parts of larger construction work and next-step decisions." },
  ] },
};

function normalizeTradeName(value: string): Prospect["trade"] {
  return normalizeTradeCategory(value) ?? "General Contractor";
}

function normalizeLocationCopy(value: string, rawCity: string, displayCity: string, rawState: string, displayState: string) {
  if (!value) return value;
  const escapedCity = rawCity.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedState = rawState.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cityNormalized = escapedCity ? value.replace(new RegExp(escapedCity, "gi"), displayCity) : value;
  return escapedState.length === 2
    ? cityNormalized.replace(new RegExp(`\\b${escapedState}\\b`, "gi"), displayState)
    : cityNormalized;
}

function trustItemDescription(item: string) {
  if (/serving/i.test(item)) return "Service-area details are stated up front for nearby homeowners.";
  if (/phone|contact/i.test(item)) return "A direct call option is available for questions and estimates.";
  if (/service/i.test(item)) return "The main types of work are grouped by property need.";
  return "An estimate starts with the property, timing, and service details.";
}

function businessInitials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return letters || "WW";
}

function proofCopy(trade: Prospect["trade"], displayTrade: string) {
  const byTrade: Partial<Record<Prospect["trade"], { headline: string; intro: string; checkpoints: [TradeServiceCard, TradeServiceCard, TradeServiceCard] }>> = {
    "Pressure Washing": {
      headline: "Exterior surfaces homeowners care about most.",
      intro: "House washing, concrete cleaning, and soft washing are grouped around the parts of the property that need attention.",
      checkpoints: [
        { title: "House exterior", description: "Siding, trim, brick, and stucco can collect algae, dirt, and weather stains." },
        { title: "Driveways and patios", description: "Concrete, walkways, and patio areas often need a different cleaning approach than siding." },
        { title: "Sensitive surfaces", description: "Roof areas and softer exterior materials call for lower-pressure cleaning when offered." },
      ],
    },
    HVAC: {
      headline: "Heating and cooling service without the guesswork.",
      intro: "Repairs, replacements, and maintenance are separated by the kind of comfort issue a homeowner is dealing with.",
      checkpoints: [
        { title: "Repairs", description: "No-heat, no-cooling, airflow, and unusual-sound concerns can be described before service." },
        { title: "Installation", description: "Replacement work starts with the home, comfort goals, and current system situation." },
        { title: "Maintenance", description: "Seasonal tune-ups and routine care stay separate from urgent repair requests." },
      ],
    },
    Roofing: {
      headline: "Roof concerns sorted by the work they may need.",
      intro: "Leaks, storm damage, missing shingles, and replacement questions each need a practical next step.",
      checkpoints: [
        { title: "Repair concerns", description: "Leaks, flashing, missing shingles, and roof damage can be described clearly." },
        { title: "Replacement planning", description: "Bigger roofing projects start with materials, scope, and the home's condition." },
        { title: "Storm review", description: "Wind and hail concerns can be separated from routine repair questions." },
      ],
    },
  };
  return byTrade[trade] ?? {
    headline: `${displayTrade} work organized around the property need.`,
    intro: "The service options stay focused on the work, the property details, and the estimate request.",
    checkpoints: [
      { title: "Choose the work", description: "The most common property needs are grouped by service type." },
      { title: "Share the details", description: "The estimate can start with the property, timing, and scope." },
      { title: "Request service", description: "The next step stays focused on a practical quote or estimate." },
    ],
  };
}

function faqItems(trade: Prospect["trade"], ctaLabel: string): [TradeServiceCard, TradeServiceCard, TradeServiceCard] {
  const action = ctaLabel.toLowerCase();
  const byTrade: Partial<Record<Prospect["trade"], [TradeServiceCard, TradeServiceCard, TradeServiceCard]>> = {
    "Pressure Washing": [
      { title: "What surfaces can I ask about?", description: "Share whether you need help with siding, concrete, patios, roof areas, or another exterior surface." },
      { title: "Can I describe the property first?", description: "Yes. Include the surface type, location, and what you want cleaned." },
      { title: "What is the next step?", description: `Use ${action} and include the surfaces, photos if available, and the best way to reach you.` },
    ],
    HVAC: [
      { title: "Can I request repair or replacement help?", description: "Yes. Share whether the system needs urgent repair, seasonal maintenance, or replacement planning." },
      { title: "What details should I include?", description: "Share the system concern, home comfort issue, and whether the problem is urgent." },
      { title: "What is the next step?", description: `Use ${action} or call so the team can confirm the right service path.` },
    ],
  };
  return byTrade[trade] ?? [
    { title: "What should I include?", description: "Share the service needed, property details, timing, and the best way to reach you." },
    { title: "Can I ask about a specific project?", description: "Yes. Include the job type, location, timing, and any details that affect the estimate." },
    { title: "What is the next step?", description: `Use ${action} and include enough detail for a useful response.` },
  ];
}

function confidenceCopy(trade: Prospect["trade"], businessName: string) {
  const byTrade: Partial<Record<Prospect["trade"], string>> = {
    "Pressure Washing": "House washing, concrete cleaning, and soft washing are framed around the surfaces homeowners want cleaned.",
    HVAC: "Repair, maintenance, and replacement requests are grouped around the comfort issue in the home.",
    Roofing: "Repair, replacement, and storm concerns are separated by what the roof appears to need.",
    Plumbing: "Leaks, drains, fixtures, and water-heater concerns can be described before the visit.",
    Electrical: "Repairs, upgrades, lighting, and circuit work are presented by the type of electrical help needed.",
  };
  return byTrade[trade] ?? `${businessName} presents the main services around the property need, timing, and estimate request.`;
}

function quoteProcess(displayTrade: string, ctaLabel: string): [TradeProcessCopy, TradeProcessCopy, TradeProcessCopy] {
  return [
    { title: "Choose the service", description: `Pick the ${displayTrade.toLowerCase()} help that best matches the property.` },
    { title: "Share the details", description: "Send the address, timing, surface or room details, and the best way to reach you." },
    { title: ctaLabel, description: "Request an estimate with enough detail for a useful response." },
  ];
}

function previewImageProps(image: ResolvedPreviewImage, slot: PreviewImageRenderSlot = image.slot) {
  return {
    alt: image.alt,
    section: image.section,
    slot,
    src: image.src,
    source: image.source,
  };
}

export function ProspectWebsitePreview({ prospect, publicView = false, savedPreview }: ProspectWebsitePreviewProps) {
  const canonicalTrade = normalizeTradeName(prospect.trade);
  const displayTrade = displayTradeCategory(canonicalTrade);
  const renderProspect = canonicalTrade === prospect.trade ? prospect : { ...prospect, trade: canonicalTrade };
  const preview = savedPreview ?? generatePreview(renderProspect);
  const styleProfile = previewStyleProfile(renderProspect, preview);
  const artDirection = preview.artDirection;
  const displayCity = titleCaseLocation(prospect.city);
  const displayState = displayStateCode(prospect.state);
  const escapedTrade = prospect.trade.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const normalizeCopy = (value: string) => normalizeLocationCopy(value, prospect.city, displayCity, prospect.state, displayState)
    .replace(new RegExp(`\\b${escapedTrade}\\b`, "gi"), displayTrade);
  const pageCopy = tradePageCopy[canonicalTrade];
  const serviceArea = normalizeCopy(prospect.serviceArea || `${displayCity}, ${displayState}`);
  const images = preview.resolvedImages ?? resolvePreviewImages(renderProspect, pageCopy.services);
  const proof = proofCopy(canonicalTrade, displayTrade);
  const faqs = faqItems(canonicalTrade, styleProfile.ctaLabel);
  const steps = quoteProcess(displayTrade, styleProfile.ctaLabel);
  const initials = businessInitials(prospect.businessName);
  const galleryAssets = images.gallery;
  const heroSupporting = normalizeCopy(preview.heroSupporting ?? preview.hero);
  const serviceSummary = normalizeCopy(preview.hero);
  const trustItems = (preview.trustItems ?? [
    `Serving ${displayCity}, ${displayState}`,
    prospect.phone ? "Direct phone contact" : "Estimate request",
    `${displayTrade} services`,
    "Easy estimate request",
  ]).map(normalizeCopy);
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
        data-card-style={artDirection?.cardStyle ?? "layered-photo-cards"}
        data-hero-treatment={artDirection?.heroTreatment ?? "clean-editorial"}
        data-layout={styleProfile.layoutStyle}
        data-layout-direction={preview.layoutDirection ?? "split-photo"}
        data-rhythm={artDirection?.layoutRhythm ?? "calm-premium"}
        data-tone={styleProfile.tone}
        style={style}
      >
        <nav className="prospect-preview-nav" aria-label={`${prospect.businessName} concept navigation`}>
          <a className="prospect-preview-brand" href="#top">
            <span className="prospect-preview-logo" aria-hidden="true">{initials}</span>
            <span>{prospect.businessName}</span>
          </a>
          <div>
            <a href="#services">Services</a>
            <a href="#gallery">Gallery</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
          </div>
          <a className="prospect-preview-button" href="#contact">{styleProfile.ctaLabel}</a>
        </nav>

        <section className="prospect-preview-hero" id="top">
          <div className="prospect-preview-hero__content">
            <span className="prospect-preview-kicker">{displayTrade} in {displayCity}, {displayState}</span>
            <h1>{pageCopy.heroHeadline}</h1>
            <p>{heroSupporting}</p>
            <div className="prospect-preview-actions">
              <a className="prospect-preview-button" href="#contact">{styleProfile.ctaLabel}</a>
              {prospect.phone
                ? <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>
                : <a className="prospect-preview-text-link" href="#services">Explore services</a>}
            </div>
            <div className="prospect-preview-hero__proof-strip" aria-label="Service shortcuts">
              {(preview.serviceHighlights ?? pageCopy.services.map((item) => item.title)).slice(0, 3).map((item, index) => (
                <a href={`#service-${index + 1}`} key={item}>
                  <b>{item}</b>
                  <i>{index === 0 ? "Core service" : index === 1 ? "Estimate details" : `${displayCity} area`}</i>
                </a>
              ))}
            </div>
          </div>
          <aside className="prospect-preview-hero__visual">
            <TradePreviewImage {...previewImageProps(images.hero, "hero")} />
            <div className="prospect-preview-visual-caption">
              <small>{displayTrade} services</small>
              <strong>{displayCity} homeowners can match the property need to the right service.</strong>
              <span>Clear surface details, local service-area copy, and a direct estimate request work together.</span>
            </div>
          </aside>
        </section>

        <section className="prospect-preview-trust" aria-label="Business trust highlights">
          {trustItems.slice(0, 4).map((item) => <span key={item}><b>{item}</b><i>{trustItemDescription(item)}</i></span>)}
        </section>

        <section className="prospect-preview-section prospect-preview-services" id="services">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Services</span>
            <h2>{pageCopy.servicesHeadline}</h2>
            <p>{pageCopy.servicesIntro} {serviceSummary}</p>
          </div>
          <div className="prospect-preview-service-list">
            {pageCopy.services.map((item, index) => (
              <article id={`service-${index + 1}`} key={item.title}>
                <TradePreviewImage {...previewImageProps(images.services[index], "service")} />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <a href="#contact">{styleProfile.ctaLabel}</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="prospect-preview-why">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Why choose us</span>
            <h2>Answers homeowners need before they call.</h2>
            <p>{confidenceCopy(canonicalTrade, prospect.businessName)}</p>
          </div>
          <div>
            {trustItems.slice(0, 3).map((item) => (
              <article key={item}>
                <span aria-hidden="true">{item.slice(0, 1)}</span>
                <h3>{item}</h3>
                <p>{trustItemDescription(item)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="prospect-preview-work" id="work">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Service guide</span>
            <h2>{proof.headline}</h2>
            <p>{proof.intro}</p>
          </div>
          <div className="prospect-preview-proof-layout">
            <TradePreviewImage {...previewImageProps(images.gallery[2], "proof")} />
            <div className="prospect-preview-proof-notes">
              {proof.checkpoints.map((item) => (
                <article key={item.title}>
                  <b>{item.title}</b>
                  <span>{item.description}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="prospect-preview-process" aria-label="Quote request process">
          <div>
            <span className="prospect-preview-kicker">How to start</span>
            <h2>Get from question to quote faster.</h2>
            <TradePreviewImage {...previewImageProps(images.process, "proof")} />
          </div>
          <ol>
            {steps.map((item) => (
              <li key={item.title}>
                <b>{item.title}</b>
                <span>{item.description}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="prospect-preview-gallery-section" id="gallery">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Gallery</span>
            <h2>Show the surfaces and settings people recognize.</h2>
            <p>Photos should look like the homes, yards, rooms, and exterior surfaces customers are asking about.</p>
          </div>
          <div className="prospect-preview-gallery" aria-label={`${displayTrade} service gallery`}>
            {galleryAssets.map((asset, index) => (
              <a href={`#preview-gallery-${index + 1}`} key={asset.src}>
                <TradePreviewImage {...previewImageProps(asset, "service")} />
                <span>{index === 0 ? "Service detail" : index === 1 ? "Property context" : "Finished look"}</span>
              </a>
            ))}
          </div>
          {galleryAssets.map((asset, index) => (
            <div className="prospect-preview-lightbox" id={`preview-gallery-${index + 1}`} key={`lightbox-${asset.src}`} role="dialog" aria-label={`${displayTrade} gallery image ${index + 1}`}>
              <a className="prospect-preview-lightbox__close" href="#gallery">Close image</a>
              <TradePreviewImage {...previewImageProps(asset, "hero")} />
            </div>
          ))}
        </section>

        <section className="prospect-preview-compare" aria-label="Service comparison slider">
          <div>
            <span className="prospect-preview-kicker">Service comparison</span>
            <h2>Help customers picture the finished result.</h2>
            <p>Use a simple comparison to show the kind of visible refresh the service is meant to provide.</p>
          </div>
          <div className="prospect-preview-slider-card">
            <TradePreviewImage {...previewImageProps(images.beforeAfter, "service")} />
            <label htmlFor="preview-before-after">Move the slider to picture the cleaning result</label>
            <input id="preview-before-after" min="0" max="100" type="range" defaultValue="58" />
            <div><span>Current condition</span><span>Cleaner finish</span></div>
          </div>
        </section>

        <section className="prospect-preview-service-area">
          <span className="prospect-preview-kicker">Service area</span>
          <h2>Local service, clearly defined.</h2>
          <p>{prospect.businessName} serves {serviceArea}. Contact the team to confirm availability for your property and project.</p>
          {prospect.phone && <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>}
        </section>

        <section className="prospect-preview-faq" id="faq">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Questions</span>
            <h2>Answer the questions people ask before they call.</h2>
          </div>
          <div>
            {faqs.map((item, index) => (
              <details key={item.title} open={index === 0}>
                <summary>{item.title}</summary>
                <p>{item.description}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="prospect-preview-contact" id="contact">
          <div>
            <span className="prospect-preview-kicker">Start a conversation</span>
            <h2>A simple path to the right next step.</h2>
            <p>Tell us what needs done, where it is, and when you would like the work estimated.</p>
            <TradePreviewImage {...previewImageProps(images.cta, "proof")} />
          </div>
          <form action="#contact" aria-describedby="preview-form-note">
            <label>Name<input name="name" required /></label>
            <label>Phone<input name="phone" required inputMode="tel" /></label>
            <label>How can we help?<textarea name="message" required minLength={12} /></label>
            <p id="preview-form-note">Preview only: this concept form is not connected to a live submission destination.</p>
            <button type="submit">{styleProfile.ctaLabel}</button>
          </form>
        </section>

        <footer className="prospect-preview-footer">
          <strong>{prospect.businessName}</strong>
          <span>{displayTrade} | {serviceArea}</span>
          {prospect.phone && <a href={`tel:${prospect.phone}`}>{prospect.phone}</a>}
        </footer>
        <a className="prospect-preview-mobile-cta" href="#contact">{styleProfile.ctaLabel}</a>
      </div>
    </main>
  );
}
