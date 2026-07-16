import React, { type CSSProperties } from "react";
import { TradePreviewImage, type PreviewImageRenderSlot } from "@/components/engine/TradePreviewImage";
import {
  displayStateCode,
  displayTradeCategory,
  generatePreview,
  normalizeTradeCategory,
  previewRenderPlan,
  previewStyleProfile,
  titleCaseLocation,
  type PreviewConcept,
  type PreviewBusinessProfile,
  type PreviewSectionId,
  type Prospect,
} from "@/lib/prospect-engine";
import { isPublicPreviewImageRelevant, resolvePreviewImages, type ResolvedPreviewImage } from "@/lib/preview-image-resolver";

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

function words(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length > 2);
}

function matchedServiceTemplate(
  trade: Prospect["trade"],
  title: string,
  pageCopy: TradePageCopy,
) {
  const lower = title.toLowerCase();
  if (trade === "Pressure Washing") {
    if (/roof|soft/.test(lower)) return pageCopy.services[2];
    if (/concrete|driveway|walk|patio|paver/.test(lower)) return pageCopy.services[1];
    if (/house|siding|exterior|surface/.test(lower)) return pageCopy.services[0];
  }
  if (trade === "Landscaping") {
    if (/plant|bed|mulch|install|garden/.test(lower)) return pageCopy.services[1] ?? pageCopy.services[0];
    if (/patio|hardscape|outdoor/.test(lower)) return pageCopy.services[2] ?? pageCopy.services[0];
    if (/lawn|season|maintenance|yard/.test(lower)) return pageCopy.services[0];
  }
  if (trade === "HVAC") {
    if (/install|replacement|system/.test(lower)) return pageCopy.services[1] ?? pageCopy.services[0];
    if (/maintenance|tune|season/.test(lower)) return pageCopy.services[2] ?? pageCopy.services[0];
    if (/repair|heating|cooling|air/.test(lower)) return pageCopy.services[0];
  }
  return undefined;
}

function profileServiceCards(
  profile: PreviewBusinessProfile | undefined,
  pageCopy: TradePageCopy,
  trade: Prospect["trade"],
  plannedServices: string[] = [],
  padToThree = true,
): TradeServiceCard[] {
  const serviceNames = (plannedServices.length ? plannedServices : profile?.verifiedServices?.length ? profile.verifiedServices : pageCopy.services.map((service) => service.title)).slice(0, 3);
  const fallback = pageCopy.services;
  const cards = serviceNames.map((title, index) => {
    const tokens = words(title);
    const matched = matchedServiceTemplate(trade, title, pageCopy) ?? pageCopy.services.find((service) => {
      const haystack = words(`${service.title} ${service.description}`);
      return tokens.some((token) => haystack.includes(token));
    });
    return {
      title,
      description: matched?.description ?? serviceDescriptionFallback(trade, title, index),
    };
  });
  if (padToThree) while (cards.length < 3) cards.push(fallback[cards.length] ?? fallback[0]);
  return cards.slice(0, 3);
}

function imageResolverServices(cards: TradeServiceCard[], fallback: TradePageCopy["services"]): [TradeServiceCard, TradeServiceCard, TradeServiceCard] {
  const services = [...cards];
  while (services.length < 3) services.push(fallback[services.length] ?? fallback[0]);
  return services.slice(0, 3) as [TradeServiceCard, TradeServiceCard, TradeServiceCard];
}

function serviceDescriptionFallback(trade: Prospect["trade"], title: string, index: number) {
  const lower = title.toLowerCase();
  if (trade === "Pressure Washing") {
    if (/house|siding|exterior/.test(lower)) return "Wash away dirt, algae, and buildup from the exterior surfaces around the home.";
    if (/concrete|driveway|walk|patio|paver/.test(lower)) return "Clean driveways, walkways, patios, and other concrete areas that collect stains and grime.";
    if (/roof|soft/.test(lower)) return "Use a gentler wash approach for roof areas and surfaces that need lower pressure.";
    if (/gutter/.test(lower)) return "Clear leaves and buildup from gutters so rainwater has a cleaner path away from the home.";
    if (/window/.test(lower)) return "Clean exterior glass and frames for a brighter, clearer finish around the home.";
  }
  if (trade === "Landscaping") {
    if (/plant|bed|mulch|install/.test(lower)) return "Shape planting beds, edging, and outdoor details around the property.";
    if (/lawn|season|maintenance/.test(lower)) return "Keep the yard, beds, and outdoor spaces looking cared for through the season.";
  }
  if (trade === "Roofing") return index === 0 ? "Address leaks, damaged shingles, flashing, and visible roof concerns." : "Plan the right roofing work around the home's condition and scope.";
  if (trade === "HVAC") return index === 0 ? "Get help with heating, cooling, airflow, and system concerns." : "Plan repairs, replacement, or seasonal care around the home's comfort needs.";
  return `Request help with ${title.toLowerCase()} and share the property details needed for an estimate.`;
}

function trustItemDescription(item: string, trade: Prospect["trade"]) {
  if (/serving/i.test(item)) {
    const service = trade === "HVAC" ? "heating and cooling" : trade.toLowerCase();
    return `Local ${service} service across the listed area.`;
  }
  if (/^call\b|phone/i.test(item)) return "Talk with the team about the service your property needs.";
  if (/review|rating/i.test(item)) return "Based on the public business listing.";
  if (/\|/.test(item)) return "Core services available for local homes and properties.";
  return "Request an estimate for the work that needs attention.";
}

function faqItems(trade: Prospect["trade"], ctaLabel: string): [TradeServiceCard, TradeServiceCard, TradeServiceCard] {
  const action = ctaLabel.toLowerCase();
  const byTrade: Partial<Record<Prospect["trade"], [TradeServiceCard, TradeServiceCard, TradeServiceCard]>> = {
    "Pressure Washing": [
      { title: "What exterior surfaces can be cleaned?", description: "Common requests include siding, brick, stucco, driveways, walkways, patios, gutters, and roof areas when that service is offered." },
      { title: "Is every surface cleaned the same way?", description: "No. Siding, concrete, roof areas, and other materials can require different pressure and cleaning methods." },
      { title: "How do I request an estimate?", description: `Use ${action} and share the property address, surfaces you want cleaned, and the best way to reach you.` },
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

function tradePhrase(displayTrade: string) {
  return displayTrade === "HVAC" ? "HVAC" : displayTrade.toLowerCase();
}

function quoteProcess(displayTrade: string, ctaLabel: string): [TradeProcessCopy, TradeProcessCopy, TradeProcessCopy] {
  const projectDetails = displayTrade === "Pressure Washing"
    ? "Include the address, surfaces that need cleaning, timing, and the best way to reach you."
    : displayTrade === "HVAC"
      ? "Include the address, system concern, timing, and the best way to reach you."
      : "Include the address, project details, timing, and the best way to reach you.";
  return [
    { title: "Choose the service", description: `Choose the ${tradePhrase(displayTrade)} work that matches what needs attention.` },
    { title: "Share the property", description: projectDetails },
    { title: ctaLabel, description: "Request an estimate so the next step can be confirmed." },
  ];
}

function processHeadline(trade: Prospect["trade"]) {
  const byTrade: Partial<Record<Prospect["trade"], string>> = {
    HVAC: "Start with the comfort issue at home.",
    Roofing: "Start with the roof concern you are seeing.",
    Plumbing: "Start with the plumbing issue that needs attention.",
    Electrical: "Start with the electrical work you need handled.",
    Landscaping: "Start with the outdoor area you want improved.",
    "Pressure Washing": "Start with the surface that needs attention.",
  };
  return byTrade[trade] ?? "Start with the work your property needs.";
}

function contactIntro(trade: Prospect["trade"]) {
  const byTrade: Partial<Record<Prospect["trade"], string>> = {
    "Pressure Washing": "Tell us what needs cleaning, where the property is, and when you would like an estimate.",
    HVAC: "Tell us what the system is doing, where the property is, and when you need service.",
    Roofing: "Tell us what you are seeing on the roof, where the property is, and when you would like an inspection.",
    Plumbing: "Tell us what is happening, where the property is, and how soon you need plumbing help.",
    Electrical: "Tell us about the electrical work, where the property is, and when you need service.",
    Landscaping: "Tell us what you want to improve outdoors, where the property is, and when you would like to begin.",
  };
  return byTrade[trade] ?? "Tell us about the work, where the property is, and when you would like an estimate.";
}

function cleanVisualCaption(trade: Prospect["trade"], displayCity: string) {
  const byTrade: Partial<Record<Prospect["trade"], { label: string; headline: string; body: string }>> = {
    "Pressure Washing": {
      label: "Exterior cleaning",
      headline: `Clean exterior surfaces around ${displayCity}.`,
      body: "Wash away buildup from siding, concrete, patios, and roof areas when soft washing is offered.",
    },
    Landscaping: {
      label: "Outdoor care",
      headline: `Yards around ${displayCity} get a plan that fits the season.`,
      body: "Planting, lawn care, and outdoor updates stay focused on how the property is used.",
    },
    Roofing: {
      label: "Roofing service",
      headline: `Roof concerns around ${displayCity} get a practical next step.`,
      body: "Repair, replacement, and storm concerns can be described before scheduling an estimate.",
    },
    HVAC: {
      label: "Home comfort",
      headline: `Heating and cooling needs around ${displayCity} stay easy to explain.`,
      body: "Repairs, maintenance, and replacement questions are grouped by the comfort issue at home.",
    },
  };
  return byTrade[trade] ?? {
    label: "Local service",
    headline: `${displayCity} homeowners can match the property need to the right service.`,
    body: "Share what needs work, where it is, and when you would like it looked at.",
  };
}

function serviceShortcutText(trade: Prospect["trade"], serviceTitle: string, index: number, displayCity: string) {
  const lower = serviceTitle.toLowerCase();
  if (trade === "Pressure Washing") {
    if (/roof|soft/.test(lower)) return "Gentler exterior cleaning";
    if (/concrete|driveway|patio|walk/.test(lower)) return "Driveways and patios";
    if (/house|siding|exterior/.test(lower)) return "Siding and home exteriors";
  }
  const pressureWashing = ["Exterior surfaces", "Driveways and patios", `${displayCity} homes`];
  const roofing = ["Roof concerns", "Repair or replace", `${displayCity} area`];
  const hvac = ["Comfort issues", "Repair or install", `${displayCity} homes`];
  const landscaping = ["Yard goals", "Seasonal care", `${displayCity} properties`];
  const fallback = ["Service need", "Project details", `${displayCity} area`];
  const labels = trade === "Pressure Washing"
    ? pressureWashing
    : trade === "Roofing"
      ? roofing
      : trade === "HVAC"
        ? hvac
        : trade === "Landscaping"
          ? landscaping
          : fallback;
  return labels[index] ?? fallback[index] ?? "Local service";
}

function galleryCopy(trade: Prospect["trade"], displayCity: string) {
  const byTrade: Partial<Record<Prospect["trade"], { headline: string; intro: string }>> = {
    "Pressure Washing": {
      headline: "Cleaner siding, concrete, and exterior surfaces.",
      intro: `Homes around ${displayCity} can collect algae, dirt, and weather stains on the surfaces people see every day.`,
    },
    Landscaping: {
      headline: `Outdoor spaces around ${displayCity} with room to look more cared for.`,
      intro: "Lawns, planting beds, and hardscape areas all shape the first impression of a property.",
    },
    Roofing: {
      headline: "Roof details homeowners usually want checked first.",
      intro: "Shingles, flashing, storm concerns, and roofline details can be discussed before an estimate.",
    },
    HVAC: {
      headline: "Heating and cooling details that affect comfort at home.",
      intro: "Equipment, airflow, maintenance, and replacement needs are easier to sort when the issue is clear.",
    },
  };
  return byTrade[trade] ?? {
    headline: "A closer look at the work customers ask about.",
    intro: "Use the service photos as a quick way to match the property need to the right estimate request.",
  };
}

function galleryLabel(trade: Prospect["trade"], index: number) {
  const pressureWashing = ["Exterior washing", "Concrete cleaning", "Roof and soft wash"];
  const landscaping = ["Yard care", "Planting areas", "Outdoor finish"];
  const roofing = ["Roof surface", "Repair area", "Finished roofline"];
  const hvac = ["System service", "Equipment care", "Comfort check"];
  const fallback = ["Service work", "Property detail", "Finished result"];
  const labels = trade === "Pressure Washing"
    ? pressureWashing
    : trade === "Landscaping"
      ? landscaping
      : trade === "Roofing"
        ? roofing
        : trade === "HVAC"
          ? hvac
          : fallback;
  return labels[index] ?? fallback[index] ?? "Service photo";
}

function logoImageUrl(profile: PreviewBusinessProfile | undefined) {
  if (!profile || profile.logo.status !== "available" || !profile.logo.url) return "";
  return profile.logo.url;
}

function verifiedProfileFact(profile: PreviewBusinessProfile | undefined, label: string) {
  return profile?.sourceFacts.find((fact) => fact.label === label && fact.confidence === "verified")?.value ?? "";
}

function meaningfulDifferentiators(profile: PreviewBusinessProfile | undefined) {
  return (profile?.realDifferentiators ?? []).filter((fact) => /review|rating|years|license|certif|warrant|guarantee|insured|award|locally owned|family owned/i.test(fact.label)
    && fact.confidence === "verified").slice(0, 3);
}

function wordmarkDescriptor(trade: Prospect["trade"], city: string) {
  if (trade === "Pressure Washing") return `Exterior cleaning | ${city}`;
  if (trade === "HVAC") return `Heating & cooling | ${city}`;
  if (trade === "Roofing") return `Roofing | ${city}`;
  if (trade === "Landscaping") return `Outdoor spaces | ${city}`;
  return `${displayTradeCategory(trade)} | ${city}`;
}

function wordmarkParts(businessName: string, trade: Prospect["trade"]) {
  const parts = businessName.trim().split(/\s+/).filter(Boolean);
  const tradeWords = new Set(words(displayTradeCategory(trade)).concat(trade === "Pressure Washing" ? ["wash", "washing", "prowash"] : []));
  const qualifierStart = parts.findIndex((part, index) => index > 0 && tradeWords.has(part.toLowerCase().replace(/[^a-z0-9]/g, "")));
  if (qualifierStart > 0) {
    return {
      lead: parts.slice(0, qualifierStart).join(" "),
      qualifier: parts.slice(qualifierStart).join(" "),
    };
  }
  if (parts.length > 2) {
    return { lead: parts.slice(0, -1).join(" "), qualifier: parts.at(-1) ?? "" };
  }
  return { lead: businessName, qualifier: "" };
}

function heroHeadlineCopy(
  trade: Prospect["trade"],
  businessName: string,
  displayCity: string,
  fallback: string,
) {
  const byTrade: Partial<Record<Prospect["trade"], string>> = {
    "Pressure Washing": "Bring back a cleaner exterior.",
    Landscaping: "Make more of the space outside.",
    Roofing: "Roofing help when your home needs it.",
    HVAC: "Keep home comfortable in every season.",
    Plumbing: `Plumbing help for ${displayCity} homes.`,
    Electrical: `Electrical help for ${displayCity} homes.`,
  };
  const selected = byTrade[trade] ?? fallback;
  if (selected.length <= 78) return selected;
  return `${businessName} service in ${displayCity}.`;
}

function heroSupportingCopy(
  trade: Prospect["trade"],
  serviceCards: readonly TradeServiceCard[],
  serviceArea: string,
  fallback: string,
) {
  if (trade === "Pressure Washing") {
    return `${serviceCards.map((service) => service.title).join(", ")} for homes and properties across ${serviceArea}.`;
  }
  return fallback;
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
  const businessProfile = preview.businessProfile;
  const businessName = businessProfile?.officialBusinessName ?? prospect.businessName;
  const officialTagline = verifiedProfileFact(businessProfile, "Official tagline");
  const serviceCards = profileServiceCards(businessProfile, pageCopy, canonicalTrade, preview.creativeBrief?.services, !preview.renderPlan);
  const alignedServiceArea = (value: string) => {
    const normalized = normalizeCopy(value);
    const lower = normalized.toLowerCase();
    return lower.includes(displayCity.toLowerCase()) || lower.includes(displayState.toLowerCase())
      ? normalized
      : `${displayCity}, ${displayState}`;
  };
  const serviceArea = alignedServiceArea(prospect.serviceArea || `${displayCity}, ${displayState}`);
  const images = preview.resolvedImages ?? resolvePreviewImages(renderProspect, imageResolverServices(serviceCards, pageCopy.services));
  const renderPlan = previewRenderPlan(renderProspect, preview);
  const ctaLabel = renderPlan.ctaStrategy.label || styleProfile.ctaLabel;
  const faqs = faqItems(canonicalTrade, ctaLabel);
  const steps = quoteProcess(displayTrade, ctaLabel);
  const sectionEnabled = (id: PreviewSectionId) =>
    renderPlan.sectionDecisions.find((decision) => decision.id === id)?.status !== "omitted";
  const visualCaption = cleanVisualCaption(canonicalTrade, displayCity);
  const galleryText = galleryCopy(canonicalTrade, displayCity);
  const imageRelevant = (image: ResolvedPreviewImage) => isPublicPreviewImageRelevant(image, canonicalTrade);
  const dependableImage = (image: ResolvedPreviewImage) => image.source === "business-photo"
    || image.source === "configured-stock-provider"
    || image.source === "curated-stock-photo-library";
  const usedImageSources = new Set<string>();
  const takeImage = (candidates: Array<ResolvedPreviewImage | undefined | null>, options: { requireDependable?: boolean } = {}) => {
    const selected = candidates.find((image): image is ResolvedPreviewImage => image != null
      && imageRelevant(image)
      && !usedImageSources.has(image.src)
      && (!options.requireDependable || dependableImage(image)));
    if (selected) usedImageSources.add(selected.src);
    return selected ?? null;
  };
  const heroImage = takeImage([images.hero, ...images.services, ...images.gallery, images.beforeAfter]) ?? images.hero;
  const serviceImages = images.services.map((image, index) => takeImage([image, images.gallery[index], images.beforeAfter], { requireDependable: true })) as Array<ResolvedPreviewImage | null>;
  const proofImage = takeImage([images.gallery[0], images.beforeAfter, images.process, ...images.gallery], { requireDependable: true });
  const businessFirst = (candidates: Array<ResolvedPreviewImage | undefined | null>) => [
    ...candidates.filter((image) => image?.source === "business-photo"),
    ...candidates.filter((image) => image?.source !== "business-photo"),
  ];
  const processCandidates = businessFirst([images.process, images.cta, ...images.gallery]).filter((image) => image?.source !== "business-photo"
    || /crew|team|equipment|process|service call/i.test(`${image.serviceTitle ?? ""} ${image.alt}`));
  const processImage = images.sourceStatus === "approved business photos"
    ? takeImage(processCandidates.filter((image) => image?.source === "business-photo"), { requireDependable: true })
    : takeImage(processCandidates, { requireDependable: true });
  const ctaCandidate = takeImage(businessFirst([images.cta, images.process, ...images.gallery]), { requireDependable: true });
  const ctaImage = images.sourceStatus === "approved business photos" ? null : ctaCandidate;
  const galleryAssets = images.gallery.filter((image) => imageRelevant(image) && dependableImage(image) && !usedImageSources.has(image.src) && (images.sourceStatus !== "approved business photos" || image.source === "business-photo")).slice(0, 3);
  galleryAssets.forEach((image) => usedImageSources.add(image.src));
  const showGallery = galleryAssets.length >= 3 && sectionEnabled("gallery");
  const headline = normalizeCopy(officialTagline || heroHeadlineCopy(canonicalTrade, businessName, displayCity, preview.heroHeadline ?? pageCopy.heroHeadline));
  const rawHeroSupporting = normalizeCopy(preview.heroSupporting ?? preview.hero);
  const heroSupporting = rawHeroSupporting.toLowerCase().includes(displayCity.toLowerCase()) || !/nearby communities|across/i.test(rawHeroSupporting)
    ? rawHeroSupporting
    : `${businessName} provides ${serviceCards.map((service) => service.title).join(", ")} across ${serviceArea}.`;
  const heroSupportingLine = normalizeCopy(heroSupportingCopy(canonicalTrade, serviceCards, serviceArea, heroSupporting));
  const logoUrl = logoImageUrl(businessProfile);
  const wordmark = wordmarkParts(businessName, canonicalTrade);
  const hasOfficialResearch = Boolean(verifiedProfileFact(businessProfile, "Official website research"));
  const differentiators = meaningfulDifferentiators(businessProfile);
  const trustItems = (preview.trustItems ?? [
    `Serving ${displayCity}, ${displayState}`,
    prospect.phone ? "Direct phone contact" : "Estimate request",
    `${displayTrade} services`,
    "Easy estimate request",
  ]).map(normalizeCopy);
  const primaryService = serviceCards[0];
  const featuredImageService = proofImage?.serviceTitle && (businessProfile?.verifiedServices ?? []).find((service) => {
    const normalizedService = normalizeCopy(service).toLowerCase();
    const normalizedImageService = normalizeCopy(proofImage.serviceTitle ?? "").toLowerCase();
    return normalizedService === normalizedImageService
      || normalizedService.includes(normalizedImageService)
      || normalizedImageService.includes(normalizedService);
  });
  const featuredServiceName = featuredImageService || (businessProfile?.verifiedServices ?? []).find((service) => {
    const wordsToMatch = words(service);
    const imageTerms = proofImage?.intent.keywords.join(" ").toLowerCase() ?? "";
    return wordsToMatch.some((word) => imageTerms.includes(word));
  }) || primaryService.title;
  const featuredTemplate = matchedServiceTemplate(canonicalTrade, featuredServiceName, pageCopy);
  const featuredService = {
    title: featuredServiceName,
    description: featuredTemplate?.description ?? serviceDescriptionFallback(canonicalTrade, featuredServiceName, 0),
  };
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
        data-density={renderPlan.density}
        data-hero-treatment={artDirection?.heroTreatment ?? "clean-editorial"}
        data-header-treatment={renderPlan.headerTreatment}
        data-layout={styleProfile.layoutStyle}
        data-layout-direction={preview.layoutDirection ?? "split-photo"}
        data-logo-treatment={logoUrl ? "official" : "typographic-wordmark"}
        data-render-direction={renderPlan.direction}
        data-rhythm={artDirection?.layoutRhythm ?? "calm-premium"}
        data-service-presentation={renderPlan.servicePresentation}
        data-tone={styleProfile.tone}
        data-trade={canonicalTrade.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        style={style}
      >
        <nav className="prospect-preview-nav" aria-label={`${businessName} concept navigation`}>
          <a className={`prospect-preview-brand ${logoUrl ? "prospect-preview-brand--logo" : "prospect-preview-brand--wordmark"} prospect-preview-brand--${renderPlan.headerTreatment}`} href="#top">
            {logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- prospect logos can come from approved external public assets not covered by Next image domains */}
                <img className="prospect-preview-logo-image" src={logoUrl} alt={`${businessName} logo`} />
                <span className="prospect-preview-brand-copy"><strong>{businessName}</strong><small>{wordmarkDescriptor(canonicalTrade, displayCity)}</small></span>
              </>
            ) : (
              <span className="prospect-preview-brand-copy prospect-preview-wordmark">
                <strong><span>{wordmark.lead}</span>{wordmark.qualifier ? <em>{wordmark.qualifier}</em> : null}</strong>
                <small>{wordmarkDescriptor(canonicalTrade, displayCity)}</small>
              </span>
            )}
          </a>
          <div>
            <a href="#services">Services</a>
            {showGallery ? <a href="#gallery">Gallery</a> : null}
            {sectionEnabled("faq") ? <a href="#faq">FAQ</a> : null}
            <a href="#contact">Contact</a>
          </div>
          <a className="prospect-preview-button" href="#contact">{ctaLabel}</a>
        </nav>

        <section className="prospect-preview-hero" id="top">
          <div className="prospect-preview-hero__content">
            <span className="prospect-preview-kicker">{displayTrade} in {displayCity}, {displayState}</span>
            <h1>{headline}</h1>
            <p>{heroSupportingLine}</p>
            <div className="prospect-preview-actions">
              <a className="prospect-preview-button" href="#contact">{ctaLabel}</a>
              {prospect.phone
                ? <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>
                : <a className="prospect-preview-text-link" href="#services">Explore services</a>}
            </div>
            {serviceCards.length > 1 ? (
              <div className="prospect-preview-hero__proof-strip" aria-label="Service shortcuts">
                {serviceCards.map((item, index) => (
                  <a href={`#service-${index + 1}`} key={item.title}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <b>{item.title}</b>
                      <i>{serviceShortcutText(canonicalTrade, item.title, index, displayCity)}</i>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <aside className="prospect-preview-hero__visual">
            <TradePreviewImage {...previewImageProps(heroImage, "hero")} />
            <div className="prospect-preview-visual-caption">
              <small>{displayCity}, {displayState}</small>
              <strong>{primaryService.title}</strong>
              <span>{visualCaption.label}</span>
            </div>
          </aside>
        </section>

        {sectionEnabled("trust") ? <section className="prospect-preview-trust" aria-label="Business trust highlights">
          {trustItems.slice(0, 4).map((item) => <span key={item}><b>{item}</b><i>{trustItemDescription(item, canonicalTrade)}</i></span>)}
        </section> : null}

        <section className="prospect-preview-section prospect-preview-services" data-service-count={serviceCards.length} id="services">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Services</span>
            <h2>{hasOfficialResearch && canonicalTrade === "Pressure Washing" ? `${businessName} exterior cleaning services.` : pageCopy.servicesHeadline}</h2>
            <p>{pageCopy.servicesIntro}</p>
          </div>
          <div className="prospect-preview-service-list" data-service-count={serviceCards.length}>
            {serviceCards.map((item, index) => (
              <article className={serviceImages[index] ? "" : "prospect-preview-service-card--text-only"} id={`service-${index + 1}`} key={item.title}>
                {serviceImages[index] ? <TradePreviewImage {...previewImageProps(serviceImages[index], "service")} /> : null}
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <a href="#contact">{ctaLabel}</a>
                </div>
              </article>
            ))}
          </div>
        </section>

        {differentiators.length >= 2 ? <section className="prospect-preview-why">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Why {businessName}</span>
            <h2>What to know before you schedule.</h2>
          </div>
          <div>
            {differentiators.map((fact) => (
              <article key={`${fact.label}-${fact.value}`}>
                <span aria-hidden="true" className="prospect-preview-checkmark">✓</span>
                <h3>{fact.label}</h3>
                <p>{fact.value}</p>
              </article>
            ))}
          </div>
        </section> : null}

        {sectionEnabled("featured-service") ? <section className="prospect-preview-featured-service" id="work">
          {proofImage ? <TradePreviewImage {...previewImageProps(proofImage, "proof")} /> : null}
          <div>
            <span className="prospect-preview-kicker">Featured service</span>
            <h2>{featuredService.title}</h2>
            <p>{featuredService.description}</p>
            <div className="prospect-preview-featured-service__links">
              {serviceCards.slice(1).map((service) => <a href="#contact" key={service.title}>{service.title}</a>)}
            </div>
            <a className="prospect-preview-button" href="#contact">{ctaLabel}</a>
          </div>
        </section> : null}

        {sectionEnabled("process") ? <section className="prospect-preview-process" aria-label="Service request steps">
          <div>
            <span className="prospect-preview-kicker">How to start</span>
            <h2>{processHeadline(canonicalTrade)}</h2>
            {processImage ? <TradePreviewImage {...previewImageProps(processImage, "proof")} /> : null}
          </div>
          <ol>
            {steps.map((item, index) => (
              <li key={item.title}>
                <span className="prospect-preview-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <b>{item.title}</b>
                <span>{item.description}</span>
              </li>
            ))}
          </ol>
        </section> : null}

        {showGallery ? (
          <section className="prospect-preview-gallery-section" id="gallery">
            <div className="prospect-preview-section__intro">
              <span className="prospect-preview-kicker">Gallery</span>
              <h2>{galleryText.headline}</h2>
              <p>{galleryText.intro}</p>
            </div>
            <div className="prospect-preview-gallery" aria-label={`${displayTrade} service gallery`}>
              {galleryAssets.map((asset, index) => (
                <a href={`#preview-gallery-${index + 1}`} key={asset.src}>
                  <TradePreviewImage {...previewImageProps(asset, "service")} />
                  <span>{galleryLabel(canonicalTrade, index)}</span>
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
        ) : null}

        {sectionEnabled("service-area") ? <section className="prospect-preview-service-area">
          <span className="prospect-preview-kicker">Service area</span>
          <h2>Serving {displayCity} and nearby communities.</h2>
          <p>{businessName} serves {serviceArea}. Contact the team to confirm availability for your property and project.</p>
          {prospect.phone && <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>}
        </section> : null}

        {sectionEnabled("faq") ? <section className="prospect-preview-faq" id="faq">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">Questions</span>
            <h2>Questions homeowners usually ask.</h2>
          </div>
          <div>
            {faqs.map((item, index) => (
              <details key={item.title} open={index === 0}>
                <summary>{item.title}</summary>
                <p>{item.description}</p>
              </details>
            ))}
          </div>
        </section> : null}

        <section className="prospect-preview-contact" id="contact">
          <div>
            <span className="prospect-preview-kicker">Start a conversation</span>
            <h2>Request an estimate for your property.</h2>
            <p>{contactIntro(canonicalTrade)}</p>
            {ctaImage ? <TradePreviewImage {...previewImageProps(ctaImage, "proof")} /> : null}
          </div>
          <form action="#contact" aria-describedby="preview-form-note">
            <label>Name<input name="name" required /></label>
            <label>Phone<input name="phone" required inputMode="tel" /></label>
            <label>How can we help?<textarea name="message" required minLength={12} /></label>
            <p id="preview-form-note">This sample form will not submit. Call or use the business&apos;s live website when you are ready.</p>
            <button type="submit">{ctaLabel}</button>
          </form>
        </section>

        <footer className="prospect-preview-footer">
          <span className="prospect-preview-footer-brand"><strong>{wordmark.lead}{wordmark.qualifier ? ` ${wordmark.qualifier}` : ""}</strong><small>{wordmarkDescriptor(canonicalTrade, displayCity)}</small></span>
          <span>{displayTrade} | {serviceArea}</span>
          {prospect.phone && <a href={`tel:${prospect.phone}`}>{prospect.phone}</a>}
        </footer>
        <a className="prospect-preview-mobile-cta" href="#contact">{ctaLabel}</a>
      </div>
    </main>
  );
}
