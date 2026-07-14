import React, { type CSSProperties } from "react";
import { TradePreviewImage } from "@/components/engine/TradePreviewImage";
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
  services: [TradeVisualAsset, TradeVisualAsset, TradeVisualAsset];
  proof: TradeVisualAsset;
  texture: string;
};

type TradeServiceCard = {
  title: string;
  description: string;
};

type TradePageCopy = {
  heroHeadline: string;
  servicesHeadline: string;
  servicesIntro: string;
  services: [TradeServiceCard, TradeServiceCard, TradeServiceCard];
};

function tradePhotoAsset(slug: string, slot: "hero" | "service" | "detail" | "support" | "proof", alt: string): TradeVisualAsset {
  return {
    src: `/engine-preview-assets/trade-photos/${slug}-${slot}.jpg`,
    fallbackSrc: `/engine-preview-assets/trades/${slug}-${slot === "detail" || slot === "support" ? "service" : slot}.svg`,
    alt,
  };
}

const tradeVisuals: Record<Prospect["trade"], TradeVisualProfile> = {
  Roofing: {
    hero: tradePhotoAsset("roofing", "hero", "Roofline, shingle detail, gutter edge, and inspection context"),
    services: [
      tradePhotoAsset("roofing", "service", "Roofing service photo with shingles, flashing, gutter edge, and inspection tools"),
      tradePhotoAsset("roofing", "detail", "Roofing detail photo with repair materials and roof surface context"),
      tradePhotoAsset("roofing", "support", "Roofing support photo with inspection and exterior detail"),
    ],
    proof: tradePhotoAsset("roofing", "proof", "Roof inspection and repair context"),
    texture: "Roofline, shingle detail, and practical inspection cues",
  },
  HVAC: {
    hero: tradePhotoAsset("hvac", "hero", "HVAC photo with an outdoor AC condenser beside a residential home"),
    services: [
      tradePhotoAsset("hvac", "service", "HVAC service photo with furnace or air handler equipment and technician tools"),
      tradePhotoAsset("hvac", "detail", "HVAC detail photo with residential ductwork, supply vent, and technician inspection"),
      tradePhotoAsset("hvac", "support", "HVAC service-call photo with technician, tool bag, and outdoor condenser"),
    ],
    proof: tradePhotoAsset("hvac", "proof", "HVAC thermostat, vent, and home comfort detail"),
    texture: "AC equipment, home comfort details, and service-call context",
  },
  Landscaping: {
    hero: tradePhotoAsset("landscaping", "hero", "Landscaping photo with lawn, planting beds, patio edge, and outdoor service context"),
    services: [
      tradePhotoAsset("landscaping", "service", "Landscaping service photo with planting bed, mulch, edging, and hand tools"),
      tradePhotoAsset("landscaping", "detail", "Landscaping detail photo with lawn and planting work"),
      tradePhotoAsset("landscaping", "support", "Landscaping support photo with patio edge and finished outdoor space"),
    ],
    proof: tradePhotoAsset("landscaping", "proof", "Finished patio edge, lawn, shrubs, and outdoor living space"),
    texture: "Lawn, planting detail, and finished outdoor space",
  },
  Plumbing: {
    hero: tradePhotoAsset("plumbing", "hero", "Plumbing photo with under-sink service, visible pipes, and repair tools"),
    services: [
      tradePhotoAsset("plumbing", "service", "Plumbing service photo with water heater, pipe fittings, and service tools"),
      tradePhotoAsset("plumbing", "detail", "Plumbing detail photo with fixtures and repair access"),
      tradePhotoAsset("plumbing", "support", "Plumbing support photo with drain lines and service tools"),
    ],
    proof: tradePhotoAsset("plumbing", "proof", "Drain trap, supply lines, and service tools"),
    texture: "Clean repair detail, water systems, and practical service cues",
  },
  Electrical: {
    hero: tradePhotoAsset("electrical", "hero", "Electrical photo with residential breaker panel service and insulated tools"),
    services: [
      tradePhotoAsset("electrical", "service", "Electrical service photo with breaker panel, tools, and safe work context"),
      tradePhotoAsset("electrical", "detail", "Electrical detail photo with wiring and panel work"),
      tradePhotoAsset("electrical", "support", "Electrical support photo with lighting installation context"),
    ],
    proof: tradePhotoAsset("electrical", "proof", "Lighting installation, tools, and clean work area"),
    texture: "Breaker panels, lighting work, and safe installation cues",
  },
  "Pressure Washing": {
    hero: tradePhotoAsset("power-washing", "hero", "Pressure washing photo with spray equipment and exterior cleaning context"),
    services: [
      tradePhotoAsset("power-washing", "service", "Pressure washing service photo with siding wash and surface cleaning detail"),
      tradePhotoAsset("power-washing", "detail", "Pressure washing detail photo with spray equipment and siding"),
      tradePhotoAsset("power-washing", "support", "Pressure washing support photo with driveway cleaning detail"),
    ],
    proof: tradePhotoAsset("power-washing", "proof", "Cleaned driveway and exterior surface detail"),
    texture: "Exterior cleaning, surface detail, and before-after potential",
  },
  Painting: {
    hero: tradePhotoAsset("painting", "hero", "Painting photo with roller, wall finish, trim, and room refresh context"),
    services: [
      tradePhotoAsset("painting", "service", "Painting service photo with trim, roller, paint tray, and careful prep"),
      tradePhotoAsset("painting", "detail", "Painting detail photo with surface prep and finish work"),
      tradePhotoAsset("painting", "support", "Painting support photo with refreshed room and trim detail"),
    ],
    proof: tradePhotoAsset("painting", "proof", "Finish detail, roller, and clean trim"),
    texture: "Prep, finish detail, and color confidence",
  },
  Concrete: {
    hero: tradePhotoAsset("concrete", "hero", "Concrete photo with driveway, walkway, and flatwork context"),
    services: [
      tradePhotoAsset("concrete", "service", "Concrete service photo with trowel, surface finish, and flatwork detail"),
      tradePhotoAsset("concrete", "detail", "Concrete detail photo with finishing and clean edges"),
      tradePhotoAsset("concrete", "support", "Concrete support photo with walkway and completed surface"),
    ],
    proof: tradePhotoAsset("concrete", "proof", "Walkway, driveway, and finished surface"),
    texture: "Concrete surfaces, clean edges, and practical planning",
  },
  Cleaning: {
    hero: tradePhotoAsset("cleaning", "hero", "Cleaning photo with clean interior, equipment, and organized service context"),
    services: [
      tradePhotoAsset("cleaning", "service", "Cleaning service photo with supplies, clean room, and equipment"),
      tradePhotoAsset("cleaning", "detail", "Cleaning detail photo with equipment and organized work"),
      tradePhotoAsset("cleaning", "support", "Cleaning support photo with refreshed interior surfaces"),
    ],
    proof: tradePhotoAsset("cleaning", "proof", "Fresh interior and cleaning equipment"),
    texture: "Fresh surfaces, equipment, and organized scope",
  },
  "Tree Service": {
    hero: tradePhotoAsset("tree-service", "hero", "Tree service photo with tree care, trimming context, and outdoor equipment"),
    services: [
      tradePhotoAsset("tree-service", "service", "Tree service photo with trimming, removal equipment, and cleanup context"),
      tradePhotoAsset("tree-service", "detail", "Tree service detail photo with trimming and safety context"),
      tradePhotoAsset("tree-service", "support", "Tree service support photo with equipment and cleanup"),
    ],
    proof: tradePhotoAsset("tree-service", "proof", "Equipment, trimming, and yard cleanup"),
    texture: "Tree care, equipment, and cleanup expectations",
  },
  Fencing: {
    hero: tradePhotoAsset("fencing", "hero", "Fencing photo with fence panels, gate, and yard boundary context"),
    services: [
      tradePhotoAsset("fencing", "service", "Fencing service photo with gate, fence line, materials, and yard detail"),
      tradePhotoAsset("fencing", "detail", "Fencing detail photo with materials and installation work"),
      tradePhotoAsset("fencing", "support", "Fencing support photo with gate and finished yard context"),
    ],
    proof: tradePhotoAsset("fencing", "proof", "Installed fence, gate, and yard context"),
    texture: "Fence lines, gates, privacy, and property fit",
  },
  Flooring: {
    hero: tradePhotoAsset("flooring", "hero", "Flooring photo with hardwood planks, tile, and installation context"),
    services: [
      tradePhotoAsset("flooring", "service", "Flooring service photo with tile, planks, installation tools, and finished surface"),
      tradePhotoAsset("flooring", "detail", "Flooring detail photo with installation and material texture"),
      tradePhotoAsset("flooring", "support", "Flooring support photo with finished floor and room context"),
    ],
    proof: tradePhotoAsset("flooring", "proof", "Installed floor, tile, and plank detail"),
    texture: "Floor surfaces, installation detail, and interior finish",
  },
  Remodeling: {
    hero: tradePhotoAsset("remodeling", "hero", "Remodeling photo with kitchen, bath, room planning, and material context"),
    services: [
      tradePhotoAsset("remodeling", "service", "Remodeling service photo with bath, kitchen, planning, and room improvement detail"),
      tradePhotoAsset("remodeling", "detail", "Remodeling detail photo with materials and room planning"),
      tradePhotoAsset("remodeling", "support", "Remodeling support photo with finished interior context"),
    ],
    proof: tradePhotoAsset("remodeling", "proof", "Room plan, kitchen, bath, and material detail"),
    texture: "Finished spaces, materials, and planning clarity",
  },
  "General Contractor": {
    hero: tradePhotoAsset("general-contractor", "hero", "Construction photo with framing, materials, blueprint, and project planning context"),
    services: [
      tradePhotoAsset("general-contractor", "service", "General contractor service photo with blueprint, framing, materials, and build process detail"),
      tradePhotoAsset("general-contractor", "detail", "Construction detail photo with framing and project materials"),
      tradePhotoAsset("general-contractor", "support", "Construction support photo with planning and build context"),
    ],
    proof: tradePhotoAsset("general-contractor", "proof", "Materials, framing, and planning context"),
    texture: "Project progress, materials, and communication clarity",
  },
};

const tradePageCopy: Record<Prospect["trade"], TradePageCopy> = {
  Roofing: { heroHeadline: "Straight answers when your roof needs attention.", servicesHeadline: "Roofing help built around the condition of your home.", servicesIntro: "Start with the problem, understand the options, and make the next step easy.", services: [
    { title: "Roof repair", description: "Address leaks, damaged shingles, flashing, and other focused roof concerns." },
    { title: "Full roof replacement", description: "Plan material choices, project scope, and a clear estimate for a larger roofing project." },
    { title: "Storm damage response", description: "Document visible concerns and request an inspection after wind, hail, or severe weather." },
  ] },
  HVAC: { heroHeadline: "Heating and cooling help without the runaround.", servicesHeadline: "A clearer way to schedule heating and cooling service.", servicesIntro: "Whether comfort is out now or a system upgrade is ahead, homeowners should know what to request and what happens next.", services: [
    { title: "Heating and cooling repair", description: "Troubleshoot comfort problems, airflow issues, unusual sounds, and systems that stop running." },
    { title: "System installation", description: "Compare replacement or new-system options around the home, comfort goals, and project scope." },
    { title: "Maintenance and tune-ups", description: "Plan seasonal system checks, filter and airflow review, and routine equipment care." },
  ] },
  Plumbing: { heroHeadline: "Plumbing help that gets to the point.", servicesHeadline: "Clear next steps for everyday plumbing problems.", servicesIntro: "Make it easy to explain the issue, understand the likely service, and request help.", services: [
    { title: "Leak and drain repair", description: "Share the location, symptoms, and urgency of leaks, clogs, or slow drains." },
    { title: "Fixture installation", description: "Plan faucet, sink, toilet, and fixture work with the right property details." },
    { title: "Water heater service", description: "Request repair or replacement help for hot-water and equipment concerns." },
  ] },
  Electrical: { heroHeadline: "Electrical service explained clearly from the start.", servicesHeadline: "Safe electrical help for repairs and planned upgrades.", servicesIntro: "Give homeowners a straightforward way to describe the issue and request qualified service.", services: [
    { title: "Electrical repair", description: "Request help for outlets, switches, circuits, and other electrical issues." },
    { title: "Panel and service upgrades", description: "Plan capacity, panel, and service changes around the property and project scope." },
    { title: "Lighting and new circuits", description: "Discuss lighting, dedicated circuits, and installation needs before scheduling." },
  ] },
  Landscaping: { heroHeadline: "A better outdoor space starts with a clear plan.", servicesHeadline: "Landscaping shaped around the property and the season.", servicesIntro: "Help homeowners move from an idea to a useful project conversation.", services: [
    { title: "Landscape design", description: "Shape planting, layout, and outdoor-use ideas around the property." },
    { title: "Installation", description: "Plan beds, plants, edging, and hardscape details with a defined scope." },
    { title: "Seasonal maintenance", description: "Organize recurring care, cleanups, and seasonal property needs." },
  ] },
  "Pressure Washing": { heroHeadline: "A cleaner exterior starts with the right surface plan.", servicesHeadline: "Exterior cleaning for the surfaces that need attention.", servicesIntro: "Show the likely scope and make it easy to request a property-specific quote.", services: [
    { title: "House washing", description: "Plan exterior siding and trim cleaning around the property materials." },
    { title: "Concrete cleaning", description: "Address driveways, walks, patios, and other hard surfaces." },
    { title: "Roof and soft washing", description: "Request a surface-aware cleaning approach for more sensitive exterior areas." },
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
  Cleaning: { heroHeadline: "Cleaning service with the scope clear before the visit.", servicesHeadline: "The right cleaning plan for the home and schedule.", servicesIntro: "Let customers choose the service type and share the details needed for a useful response.", services: [
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
  if (/serving/i.test(item)) return "Service-area expectations are easy to find.";
  if (/phone|contact/i.test(item)) return "The contact path stays visible and direct.";
  if (/service/i.test(item)) return "Homeowners can quickly find the help they need.";
  return "The next step is clear without extra searching.";
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
      headline: "Make the before-and-after easy to understand.",
      intro: "Visitors can quickly compare the surface, choose the right cleaning service, and request a quote without hunting around the page.",
      checkpoints: [
        { title: "Choose the surface", description: "House siding, concrete, roof areas, and other exterior surfaces are separated clearly." },
        { title: "Explain the condition", description: "The form guides customers to share what needs cleaning and where it is located." },
        { title: "Request a clear quote", description: "The main action stays focused on getting a property-specific estimate." },
      ],
    },
    HVAC: {
      headline: "Make urgent comfort issues easier to route.",
      intro: "The page puts repairs, replacements, and maintenance into separate paths so homeowners can ask for the right help faster.",
      checkpoints: [
        { title: "Repair path", description: "Symptoms, airflow issues, and no-heat or no-cooling concerns are easy to describe." },
        { title: "Install path", description: "Homeowners can start a replacement conversation without guessing what details matter." },
        { title: "Maintenance path", description: "Seasonal tune-ups and routine service are clearly separated from urgent repairs." },
      ],
    },
    Roofing: {
      headline: "Put roof concerns into a clearer order.",
      intro: "The page helps homeowners understand whether they need repair, replacement, storm review, or a direct estimate request.",
      checkpoints: [
        { title: "Show the concern", description: "Leaks, shingles, flashing, and storm damage are grouped into practical starting points." },
        { title: "Set expectations", description: "Inspection and estimate actions stay visible before a homeowner scrolls too far." },
        { title: "Keep details close", description: "Helpful roof details stay near the service options where homeowners need them." },
      ],
    },
  };
  return byTrade[trade] ?? {
    headline: `Make ${displayTrade.toLowerCase()} options easier to compare.`,
    intro: "Visitors can see the services, understand the next step, and contact the business without digging through a long page.",
    checkpoints: [
      { title: "Pick the service", description: "The most common customer needs are separated into clear service paths." },
      { title: "Share the project", description: "Customers can explain the property, timing, and scope before the first call." },
      { title: "Request the next step", description: "The page keeps one clear quote or estimate action within reach." },
    ],
  };
}

function faqItems(trade: Prospect["trade"], ctaLabel: string): [TradeServiceCard, TradeServiceCard, TradeServiceCard] {
  const action = ctaLabel.toLowerCase();
  const byTrade: Partial<Record<Prospect["trade"], [TradeServiceCard, TradeServiceCard, TradeServiceCard]>> = {
    "Pressure Washing": [
      { title: "What surfaces can I ask about?", description: "Share whether you need help with siding, concrete, patios, roof areas, or another exterior surface." },
      { title: "Can I describe the property first?", description: "Yes. The request flow is built around surface type, location, and what you want cleaned." },
      { title: "What is the next step?", description: `Use ${action} and include the surfaces, photos if available, and the best way to reach you.` },
    ],
    HVAC: [
      { title: "Can I request repair or replacement help?", description: "Yes. The service paths separate urgent comfort issues from system planning and maintenance." },
      { title: "What details should I include?", description: "Share the system concern, home comfort issue, and whether the problem is urgent." },
      { title: "What is the next step?", description: `Use ${action} or call so the team can confirm the right service path.` },
    ],
  };
  return byTrade[trade] ?? [
    { title: "What should I include?", description: "Share the service needed, property details, timing, and the best way to reach you." },
    { title: "Can I ask about a specific project?", description: "Yes. The page is organized so customers can describe the job before a call." },
    { title: "What is the next step?", description: `Use ${action} and include enough detail for a useful response.` },
  ];
}

function confidenceCopy(trade: Prospect["trade"], businessName: string) {
  const byTrade: Partial<Record<Prospect["trade"], string>> = {
    "Pressure Washing": "Homeowners can quickly see the surfaces you clean, the best way to request a quote, and how to get the conversation started.",
    HVAC: "Homeowners can separate urgent service, maintenance, and replacement questions before they call.",
    Roofing: "Homeowners can find repair, replacement, and storm-response information without digging through the page.",
    Plumbing: "Customers can describe the issue, see common service paths, and reach the team faster.",
    Electrical: "Customers can understand repair, upgrade, and installation paths before starting a service conversation.",
  };
  return byTrade[trade] ?? `${businessName} can use this page to make services, contact options, and next steps easier for customers to find.`;
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
  const serviceArea = normalizeCopy(prospect.serviceArea || `${displayCity}, ${displayState}`);
  const visual = tradeVisuals[canonicalTrade];
  const pageCopy = tradePageCopy[canonicalTrade];
  const proof = proofCopy(canonicalTrade, displayTrade);
  const faqs = faqItems(canonicalTrade, styleProfile.ctaLabel);
  const initials = businessInitials(prospect.businessName);
  const galleryAssets = [visual.services[1], visual.services[2], visual.proof] as const;
  const heroSupporting = normalizeCopy(preview.heroSupporting ?? preview.hero);
  const serviceSummary = normalizeCopy(preview.hero);
  const trustItems = (preview.trustItems ?? [
    `Serving ${displayCity}, ${displayState}`,
    prospect.phone ? "Direct phone contact" : "Clear contact path",
    "Services explained clearly",
    "Simple estimate next step",
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
            <div className="prospect-preview-hero__proof-strip" aria-label="Concept priorities">
              {(preview.serviceHighlights ?? pageCopy.services.map((item) => item.title)).slice(0, 3).map((item, index) => (
                <span key={item}>
                  <b>{item}</b>
                  <i>{index === 0 ? "Core service" : index === 1 ? "Fast quote path" : `${displayCity} area`}</i>
                </span>
              ))}
            </div>
          </div>
          <aside className="prospect-preview-hero__visual">
            <TradePreviewImage {...visual.hero} fallbackLabel={`${displayTrade} service visual`} slot="hero" />
            <div className="prospect-preview-visual-caption">
              <small>{displayTrade} website preview</small>
              <strong>{artDirection?.visualVoice ?? visual.texture}</strong>
              <span>Designed around clear services, visible contact options, and a cleaner path to calls or quote requests.</span>
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
              <article key={item.title}>
                <TradePreviewImage {...visual.services[index]} fallbackLabel={`${displayTrade} service visual`} slot="service" />
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="prospect-preview-why">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Why choose us</span>
            <h2>Useful proof, placed where it builds confidence.</h2>
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
            <TradePreviewImage {...visual.proof} fallbackLabel={`${displayTrade} project-proof visual`} slot="proof" />
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

        <section className="prospect-preview-gallery-section" id="gallery">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Gallery</span>
            <h2>Show customers the work before they reach out.</h2>
            <p>A visual page gives people a faster way to recognize the service they need and take the next step.</p>
          </div>
          <div className="prospect-preview-gallery" aria-label={`${displayTrade} service gallery`}>
            {galleryAssets.map((asset, index) => (
              <a href={`#preview-gallery-${index + 1}`} key={asset.src}>
                <TradePreviewImage {...asset} fallbackLabel={`${displayTrade} gallery visual`} slot="service" />
                <span>{index === 0 ? "Service detail" : index === 1 ? "Property context" : "Finished look"}</span>
              </a>
            ))}
          </div>
          {galleryAssets.map((asset, index) => (
            <div className="prospect-preview-lightbox" id={`preview-gallery-${index + 1}`} key={`lightbox-${asset.src}`} role="dialog" aria-label={`${displayTrade} gallery image ${index + 1}`}>
              <a className="prospect-preview-lightbox__close" href="#gallery">Close image</a>
              <TradePreviewImage {...asset} fallbackLabel={`${displayTrade} enlarged gallery visual`} slot="hero" />
            </div>
          ))}
        </section>

        <section className="prospect-preview-compare" aria-label="Before and after style planner">
          <div>
            <span className="prospect-preview-kicker">Before and after focus</span>
            <h2>Help visitors picture the next step.</h2>
            <p>Use a simple comparison area to make the service value easy to understand without forcing customers to read a long page.</p>
          </div>
          <div className="prospect-preview-slider-card">
            <TradePreviewImage {...visual.services[0]} fallbackLabel={`${displayTrade} before service visual`} slot="service" />
            <label htmlFor="preview-before-after">Move the slider to compare service focus</label>
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
            <p>{normalizeCopy(preview.leadCaptureStrategy)}</p>
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
