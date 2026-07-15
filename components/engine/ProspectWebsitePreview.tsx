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
  type PreviewBusinessProfile,
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
): [TradeServiceCard, TradeServiceCard, TradeServiceCard] {
  const serviceNames = (profile?.verifiedServices?.length ? profile.verifiedServices : pageCopy.services.map((service) => service.title)).slice(0, 3);
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
  while (cards.length < 3) cards.push(fallback[cards.length] ?? fallback[0]);
  return cards.slice(0, 3) as [TradeServiceCard, TradeServiceCard, TradeServiceCard];
}

function serviceDescriptionFallback(trade: Prospect["trade"], title: string, index: number) {
  const lower = title.toLowerCase();
  if (trade === "Pressure Washing") {
    if (/house|siding|exterior/.test(lower)) return "Wash away dirt, algae, and buildup from the exterior surfaces around the home.";
    if (/concrete|driveway|walk|patio|paver/.test(lower)) return "Clean driveways, walkways, patios, and other concrete areas that collect stains and grime.";
    if (/roof|soft/.test(lower)) return "Use a gentler wash approach for roof areas and surfaces that need lower pressure.";
  }
  if (trade === "Landscaping") {
    if (/plant|bed|mulch|install/.test(lower)) return "Shape planting beds, edging, and outdoor details around the property.";
    if (/lawn|season|maintenance/.test(lower)) return "Keep the yard, beds, and outdoor spaces looking cared for through the season.";
  }
  if (trade === "Roofing") return index === 0 ? "Address leaks, damaged shingles, flashing, and visible roof concerns." : "Plan the right roofing work around the home's condition and scope.";
  if (trade === "HVAC") return index === 0 ? "Get help with heating, cooling, airflow, and system concerns." : "Plan repairs, replacement, or seasonal care around the home's comfort needs.";
  return `Request help with ${title.toLowerCase()} and share the property details needed for an estimate.`;
}

function trustItemDescription(item: string) {
  if (/serving/i.test(item)) return "Local service for homeowners and property owners in the area.";
  if (/phone|contact/i.test(item)) return "Call with questions about timing, surfaces, and the work you want priced.";
  if (/service/i.test(item)) return "Core services focus on the parts of the property that need attention.";
  if (/review|rating/i.test(item)) return "Public provider data shows this business has activity customers can recognize.";
  return "Share the surface, timing, and location so the estimate can start clearly.";
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
    "Pressure Washing": "House washing, concrete cleaning, and soft washing help refresh the exterior surfaces homeowners notice first.",
    HVAC: "Repair, maintenance, and replacement options focus on the comfort issue in the home.",
    Roofing: "Repair, replacement, and storm concerns stay focused on what the roof may need.",
    Plumbing: "Leaks, drains, fixtures, and water-heater concerns can be described before the visit.",
    Electrical: "Repairs, upgrades, lighting, and circuit work stay separated by the type of electrical help needed.",
  };
  return byTrade[trade] ?? `${businessName} presents the main services around the property need, timing, and estimate request.`;
}

function tradePhrase(displayTrade: string) {
  return displayTrade === "HVAC" ? "HVAC" : displayTrade.toLowerCase();
}

function quoteProcess(displayTrade: string, ctaLabel: string): [TradeProcessCopy, TradeProcessCopy, TradeProcessCopy] {
  return [
    { title: "Choose the service", description: `Choose the ${tradePhrase(displayTrade)} work that matches what needs attention.` },
    { title: "Share the property", description: "Include the address, timing, surface or room details, and the best way to reach you." },
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

function serviceShortcutText(trade: Prospect["trade"], index: number, displayCity: string) {
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

function proofKicker(trade: Prospect["trade"]) {
  if (trade === "Pressure Washing") return "Exterior surfaces";
  if (trade === "Landscaping") return "Outdoor spaces";
  if (trade === "Roofing") return "Roof concerns";
  if (trade === "HVAC") return "Home comfort";
  return "Service focus";
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

function comparisonCopy(trade: Prospect["trade"]) {
  if (trade === "Pressure Washing") {
    return {
      label: "Surface refresh",
      headline: "Freshen up the areas people notice first.",
      body: "Exterior cleaning helps brighten siding, concrete, patios, and other visible surfaces around the home.",
      control: "Compare current buildup with a cleaner finish",
      before: "Buildup",
      after: "Cleaner surface",
    };
  }
  if (trade === "Landscaping") {
    return {
      label: "Yard refresh",
      headline: "Picture a yard with cleaner edges and a clearer plan.",
      body: "A focused landscaping visit can help planting beds, lawn edges, and outdoor areas feel more intentional.",
      control: "Compare current outdoor areas with a cleaner finish",
      before: "Before care",
      after: "After care",
    };
  }
  return {
    label: "Project view",
    headline: "Picture the work before requesting an estimate.",
    body: "Use this section to understand the kind of property details that help start the conversation.",
    control: "Compare current need with completed work",
    before: "Current need",
    after: "After service",
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

function heroHeadlineCopy(
  trade: Prospect["trade"],
  businessName: string,
  displayCity: string,
  fallback: string,
) {
  const byTrade: Partial<Record<Prospect["trade"], string>> = {
    "Pressure Washing": `Cleaner exterior surfaces around ${displayCity}.`,
    Landscaping: `Outdoor spaces that feel cared for in ${displayCity}.`,
    Roofing: `Roofing help for ${displayCity} homes.`,
    HVAC: `Heating and cooling help for ${displayCity} homes.`,
    Plumbing: `Plumbing help for ${displayCity} homes.`,
    Electrical: `Electrical help for ${displayCity} homes.`,
  };
  const selected = byTrade[trade] ?? fallback;
  if (selected.length <= 78) return selected;
  return `${businessName} service in ${displayCity}.`;
}

function heroSupportingCopy(
  trade: Prospect["trade"],
  businessName: string,
  serviceCards: [TradeServiceCard, TradeServiceCard, TradeServiceCard],
  serviceArea: string,
  fallback: string,
) {
  if (trade === "Pressure Washing") {
    return `${businessName} helps homeowners with ${serviceCards.map((service) => service.title.toLowerCase()).join(", ")} across ${serviceArea}.`;
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
  const serviceCards = profileServiceCards(businessProfile, pageCopy, canonicalTrade);
  const alignedServiceArea = (value: string) => {
    const normalized = normalizeCopy(value);
    const lower = normalized.toLowerCase();
    return lower.includes(displayCity.toLowerCase()) || lower.includes(displayState.toLowerCase())
      ? normalized
      : `${displayCity}, ${displayState}`;
  };
  const serviceArea = alignedServiceArea(prospect.serviceArea || `${displayCity}, ${displayState}`);
  const images = preview.resolvedImages ?? resolvePreviewImages(renderProspect, serviceCards);
  const proof = proofCopy(canonicalTrade, displayTrade);
  const faqs = faqItems(canonicalTrade, styleProfile.ctaLabel);
  const steps = quoteProcess(displayTrade, styleProfile.ctaLabel);
  const visualCaption = cleanVisualCaption(canonicalTrade, displayCity);
  const galleryText = galleryCopy(canonicalTrade, displayCity);
  const compareText = comparisonCopy(canonicalTrade);
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
  const galleryAssets = images.gallery.filter((image) => imageRelevant(image) && dependableImage(image) && !usedImageSources.has(image.src)).slice(0, 3);
  galleryAssets.forEach((image) => usedImageSources.add(image.src));
  const proofImage = takeImage([images.gallery[2], images.beforeAfter, images.process, ...images.gallery], { requireDependable: true });
  const processImage = takeImage([images.process, images.cta, ...images.gallery], { requireDependable: true });
  const beforeAfterImage = takeImage([images.beforeAfter, ...images.gallery], { requireDependable: true });
  const ctaImage = takeImage([images.cta, images.process, ...images.gallery], { requireDependable: true });
  const showGallery = galleryAssets.length >= 3;
  const showComparison = Boolean(beforeAfterImage);
  const headline = normalizeCopy(heroHeadlineCopy(canonicalTrade, businessName, displayCity, preview.heroHeadline ?? pageCopy.heroHeadline));
  const rawHeroSupporting = normalizeCopy(preview.heroSupporting ?? preview.hero);
  const heroSupporting = rawHeroSupporting.toLowerCase().includes(displayCity.toLowerCase()) || !/nearby communities|across/i.test(rawHeroSupporting)
    ? rawHeroSupporting
    : `${businessName} provides ${serviceCards.map((service) => service.title).join(", ")} across ${serviceArea}.`;
  const heroSupportingLine = normalizeCopy(heroSupportingCopy(canonicalTrade, businessName, serviceCards, serviceArea, heroSupporting));
  const logoUrl = logoImageUrl(businessProfile);
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
        <nav className="prospect-preview-nav" aria-label={`${businessName} concept navigation`}>
          <a className={`prospect-preview-brand ${logoUrl ? "prospect-preview-brand--logo" : "prospect-preview-brand--wordmark"}`} href="#top">
            {logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- prospect logos can come from approved external public assets not covered by Next image domains */}
                <img className="prospect-preview-logo-image" src={logoUrl} alt={`${businessName} logo`} />
                <span>{businessName}</span>
              </>
            ) : (
              <span className="prospect-preview-wordmark">{businessName}</span>
            )}
          </a>
          <div>
            <a href="#services">Services</a>
            {showGallery ? <a href="#gallery">Gallery</a> : null}
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
          </div>
          <a className="prospect-preview-button" href="#contact">{styleProfile.ctaLabel}</a>
        </nav>

        <section className="prospect-preview-hero" id="top">
          <div className="prospect-preview-hero__content">
            <span className="prospect-preview-kicker">{displayTrade} in {displayCity}, {displayState}</span>
            <h1>{headline}</h1>
            <p>{heroSupportingLine}</p>
            <div className="prospect-preview-actions">
              <a className="prospect-preview-button" href="#contact">{styleProfile.ctaLabel}</a>
              {prospect.phone
                ? <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>
                : <a className="prospect-preview-text-link" href="#services">Explore services</a>}
            </div>
            <div className="prospect-preview-hero__proof-strip" aria-label="Service shortcuts">
              {serviceCards.map((item, index) => (
                <a href={`#service-${index + 1}`} key={item.title}>
                  <b>{item.title}</b>
                  <i>{serviceShortcutText(canonicalTrade, index, displayCity)}</i>
                </a>
              ))}
            </div>
          </div>
          <aside className="prospect-preview-hero__visual">
            <TradePreviewImage {...previewImageProps(heroImage, "hero")} />
            <div className="prospect-preview-visual-caption">
              <small>{visualCaption.label}</small>
              <strong>{visualCaption.headline}</strong>
              <span>{visualCaption.body}</span>
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
            <p>{pageCopy.servicesIntro}</p>
          </div>
          <div className="prospect-preview-service-list">
            {serviceCards.map((item, index) => (
              <article className={serviceImages[index] ? "" : "prospect-preview-service-card--text-only"} id={`service-${index + 1}`} key={item.title}>
                {serviceImages[index] ? <TradePreviewImage {...previewImageProps(serviceImages[index], "service")} /> : null}
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
            <h2>Match the service to what the property needs.</h2>
            <p>{confidenceCopy(canonicalTrade, prospect.businessName)}</p>
          </div>
          <div>
            {trustItems.slice(0, 3).map((item) => (
              <article key={item}>
                <span aria-hidden="true" className="prospect-preview-checkmark">Check</span>
                <h3>{item}</h3>
                <p>{trustItemDescription(item)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="prospect-preview-work" id="work">
          <div className="prospect-preview-section__intro">
            <span className="prospect-preview-kicker">{proofKicker(canonicalTrade)}</span>
            <h2>{proof.headline}</h2>
            <p>{proof.intro}</p>
          </div>
          <div className="prospect-preview-proof-layout">
            {proofImage ? <TradePreviewImage {...previewImageProps(proofImage, "proof")} /> : null}
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

        <section className="prospect-preview-process" aria-label="Service request steps">
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
        </section>

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

        {showComparison ? <section className="prospect-preview-compare" aria-label={`${displayTrade} project comparison`}>
          <div>
            <span className="prospect-preview-kicker">{compareText.label}</span>
            <h2>{compareText.headline}</h2>
            <p>{compareText.body}</p>
          </div>
          <div className="prospect-preview-slider-card">
            <TradePreviewImage {...previewImageProps(beforeAfterImage!, "service")} />
            <label htmlFor="preview-before-after">{compareText.control}</label>
            <input id="preview-before-after" min="0" max="100" type="range" defaultValue="58" />
            <div><span>{compareText.before}</span><span>{compareText.after}</span></div>
          </div>
        </section> : null}

        <section className="prospect-preview-service-area">
          <span className="prospect-preview-kicker">Service area</span>
          <h2>Serving {displayCity} and nearby communities.</h2>
          <p>{businessName} serves {serviceArea}. Contact the team to confirm availability for your property and project.</p>
          {prospect.phone && <a className="prospect-preview-text-link" href={`tel:${prospect.phone}`}>Call {prospect.phone}</a>}
        </section>

        <section className="prospect-preview-faq" id="faq">
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
        </section>

        <section className="prospect-preview-contact" id="contact">
          <div>
            <span className="prospect-preview-kicker">Start a conversation</span>
            <h2>Request an estimate for your property.</h2>
            <p>Tell us what needs done, where it is, and when you would like the work estimated.</p>
            {ctaImage ? <TradePreviewImage {...previewImageProps(ctaImage, "proof")} /> : null}
          </div>
          <form action="#contact" aria-describedby="preview-form-note">
            <label>Name<input name="name" required /></label>
            <label>Phone<input name="phone" required inputMode="tel" /></label>
            <label>How can we help?<textarea name="message" required minLength={12} /></label>
            <p id="preview-form-note">This sample form will not submit. Call or use the business&apos;s live website when you are ready.</p>
            <button type="submit">{styleProfile.ctaLabel}</button>
          </form>
        </section>

        <footer className="prospect-preview-footer">
          <strong>{businessName}</strong>
          <span>{displayTrade} | {serviceArea}</span>
          {prospect.phone && <a href={`tel:${prospect.phone}`}>{prospect.phone}</a>}
        </footer>
        <a className="prospect-preview-mobile-cta" href="#contact">{styleProfile.ctaLabel}</a>
      </div>
    </main>
  );
}
