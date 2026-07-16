import type {
  PreviewBusinessProfile,
  PreviewRenderPlan,
  PreviewServiceFidelityResult,
  PreviewServiceHierarchyItem,
  Prospect,
  TradeCategory,
} from "@/lib/prospect-engine";
import type { PreviewImageSet } from "@/lib/preview-image-resolver";

const genericServiceNames = /^(?:service|services|our services|contact|contact us|about|home|request an estimate|get a quote|learn more)$/i;

function record(prospect: Prospect) {
  return prospect as unknown as Record<string, unknown>;
}

function stringValues(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function normalizeTitle(value: string) {
  const title = value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bHvac\b/g, "HVAC");
  return title
    .split(" ")
    .map((word, index) => index > 0 && /^(?:And|Or|Of|The|To|For|In|On|With)$/.test(word) ? word.toLowerCase() : word)
    .join(" ");
}

function normalizedKey(value: string) {
  return normalizeTitle(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function validService(value: string) {
  const normalized = normalizeTitle(value);
  return normalized.length >= 3 && normalized.length <= 90 && !genericServiceNames.test(normalized);
}

function dedupeServices(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const title = normalizeTitle(value);
    const key = normalizedKey(title);
    if (!validService(title) || !key || seen.has(key)) return [];
    seen.add(key);
    return [title];
  });
}

function researchedOfficialServices(prospect: Prospect) {
  const direct = prospect.previewResearchVerified ? stringValues(prospect.verifiedPreviewServices) : [];
  const facts = (prospect.previewResearchFacts ?? [])
    .filter((fact) => fact.label === "Verified service" && fact.confidence === "verified" && fact.provenance === "verified official source")
    .map((fact) => fact.value);
  return dedupeServices([...direct, ...facts]);
}

function providerServices(prospect: Prospect) {
  const value = record(prospect);
  return dedupeServices([
    ...stringValues(prospect.providerPreviewServices),
    ...stringValues(value.discoveredServices),
    ...stringValues(value.providerServices),
  ]);
}

function priorGroundedServices(prospect: Prospect) {
  return (prospect.preview?.serviceHierarchy ?? [])
    .filter((service) => service.provenance !== "trade fallback")
    .map((service) => service.title);
}

const serviceDescriptions: Partial<Record<TradeCategory, Array<[RegExp, string]>>> = {
  "Pressure Washing": [
    [/house|siding|exterior/, "Wash away dirt, algae, and buildup from siding, trim, brick, stucco, and other exterior surfaces."],
    [/concrete|driveway|walkway|patio|paver/, "Lift surface dirt and buildup from driveways, walkways, patios, and other concrete areas."],
    [/roof|soft/, "Use a lower-pressure exterior cleaning approach for roof surfaces when this service is appropriate."],
    [/gutter/, "Clear exterior gutter buildup and refresh the visible roofline around the home."],
  ],
  Landscaping: [
    [/design|planning/, "Plan planting, lawn, and outdoor improvements around the property and how the space is used."],
    [/plant|install|bed|mulch/, "Refresh planting beds, edges, mulch, and landscape details around the property."],
    [/maintenance|season|lawn|mow/, "Keep lawns and planted areas cared for through the changing season."],
    [/hardscape|patio|outdoor living/, "Create practical outdoor areas with patios, walkways, and finished landscape edges."],
  ],
  HVAC: [
    [/heat|furnace/, "Diagnose heating problems and discuss repair or replacement options for the home."],
    [/cool|air condition|ac repair/, "Address cooling issues, airflow concerns, and air-conditioning service needs."],
    [/install|replacement|system/, "Compare equipment and installation options for a planned heating or cooling update."],
    [/maintenance|tune/, "Schedule routine system care before the busiest heating and cooling seasons."],
  ],
  Roofing: [
    [/repair|leak|shingle/, "Review leaks, damaged shingles, flashing, and other roof concerns before planning the repair."],
    [/replace|installation|new roof/, "Discuss roofing materials, property needs, and the scope of a full replacement."],
    [/storm|inspection/, "Have visible storm or roof damage reviewed before deciding on the next step."],
    [/gutter/, "Address gutters and roofline details that help move water away from the property."],
  ],
  Plumbing: [
    [/drain|leak|pipe|repair/, "Get help with leaks, drains, pipes, and other plumbing problems around the property."],
    [/fixture|faucet|sink|toilet/, "Replace or repair faucets, sinks, toilets, and other everyday plumbing fixtures."],
    [/water heater/, "Discuss water-heater repair, replacement, and installation needs."],
  ],
  Electrical: [
    [/panel|breaker|service/, "Review breaker panels, circuits, and electrical-service concerns with a qualified professional."],
    [/light|fixture|outlet|switch/, "Install or update lighting, fixtures, outlets, and switches around the property."],
    [/wiring|repair|troubleshoot/, "Find the source of wiring and electrical problems before planning the repair."],
  ],
  Painting: [
    [/exterior/, "Refresh siding, trim, doors, and other exterior surfaces with careful preparation and paint application."],
    [/interior|room|wall|ceiling/, "Update walls, ceilings, and rooms with clean preparation and an even finished coat."],
    [/cabinet|trim|detail/, "Give cabinets, trim, and detailed surfaces a cleaner, more finished appearance."],
  ],
  Concrete: [
    [/driveway|flatwork/, "Plan durable concrete flatwork for driveways and other frequently used exterior surfaces."],
    [/patio|walkway|sidewalk/, "Create practical concrete patios, walkways, and paths around the property."],
    [/repair|resurface/, "Review cracked, worn, or uneven concrete and discuss an appropriate repair approach."],
  ],
};

export function groundedServiceDescription(trade: TradeCategory, service: string) {
  const match = serviceDescriptions[trade]?.find(([pattern]) => pattern.test(service.toLowerCase()));
  return match?.[1] ?? `Request an estimate for ${service.toLowerCase()} and confirm the property details, scope, and timing.`;
}

export function buildPreviewServiceHierarchy(prospect: Prospect, trade: TradeCategory) {
  const official = researchedOfficialServices(prospect);
  const provider = providerServices(prospect).filter((service) => !official.some((item) => normalizedKey(item) === normalizedKey(service)));
  const prior = official.length || provider.length ? [] : dedupeServices(priorGroundedServices(prospect));
  const selected = official.length || provider.length
    ? [
        ...official.map((title) => ({ title, provenance: "verified official source" as const, confidence: "verified" as const, source: "official website research" })),
        ...provider.map((title) => ({ title, provenance: "verified provider source" as const, confidence: "verified" as const, source: "provider service data" })),
      ].slice(0, 10)
    : prior.length
      ? prior.map((title) => ({ title, provenance: prospect.preview?.serviceHierarchy?.find((service) => normalizedKey(service.title) === normalizedKey(title))?.provenance ?? "verified provider source" as const, confidence: "verified" as const, source: "previous saved preview hierarchy retained after bounded research fallback" }))
      : [{ title: trade, provenance: "trade fallback" as const, confidence: "inferred" as const, source: "explicit trade fallback" }];
  return selected.map((service, index): PreviewServiceHierarchyItem => ({
    title: service.title,
    description: groundedServiceDescription(trade, service.title),
    role: index === 0 ? "primary" : index <= 3 ? "secondary" : "specialty",
    confidence: service.confidence,
    provenance: service.provenance,
    source: service.source,
    displayPriority: index + 1,
    imageAvailable: false,
  }));
}

function sameServices(left: string[], right: string[]) {
  return left.length === right.length && left.every((service, index) => normalizedKey(service) === normalizedKey(right[index] ?? ""));
}

export function evaluateServiceFidelity(prospect: Prospect, hierarchy: PreviewServiceHierarchyItem[], stages: Array<{ stage: string; values: string[]; rule: string }>): PreviewServiceFidelityResult {
  const official = researchedOfficialServices(prospect);
  const provider = providerServices(prospect);
  const prior = priorGroundedServices(prospect);
  const groundedInput = dedupeServices(official.length ? [...official, ...provider] : provider.length ? provider : prior);
  const savedServices = hierarchy.map((service) => service.title);
  const transformations = stages.flatMap((stage) => {
    if (!groundedInput.length || sameServices(groundedInput, stage.values)) return [];
    return [{ stage: stage.stage, before: groundedInput, after: stage.values, rule: stage.rule }];
  });
  if (groundedInput.length && !sameServices(groundedInput, savedServices)) {
    transformations.push({
      stage: "saved-preview",
      before: groundedInput,
      after: savedServices,
      rule: "The saved service hierarchy must preserve grounded service order without silent collapse or replacement.",
    });
  }
  return {
    status: transformations.length ? "failed" : "passed",
    groundedInput,
    savedServices,
    transformations,
  };
}

export function serviceHierarchyWithImages(hierarchy: PreviewServiceHierarchyItem[], images: PreviewImageSet) {
  return hierarchy.map((service) => ({
    ...service,
    imageAvailable: images.services.some((image) => {
      const imageService = normalizedKey(image.serviceTitle ?? "");
      const serviceKey = normalizedKey(service.title);
      return image.semanticStatus === "accepted" && Boolean(imageService) && (imageService.includes(serviceKey) || serviceKey.includes(imageService));
    }),
  }));
}

function stableVariant(value: string, length: number) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return Math.abs(hash >>> 0) % Math.max(1, length);
}

function naturalList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "the requested service";
  if (values.length === 2) return values.some((value) => /\band\b/i.test(value))
    ? `${values[0]}, plus ${values[1]}`
    : `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function previewCopyStrategy(prospect: Prospect, plan: PreviewRenderPlan) {
  const voice = plan.direction === "service-command" ? "direct-service" : plan.direction === "project-showcase" ? "visual-results" : "local-assurance";
  return {
    voice,
    variant: stableVariant(`${prospect.id}|${prospect.businessName}|${prospect.city}|${plan.direction}`, 3),
  } as const;
}

export function groundedPreviewCopy(prospect: Prospect, profile: PreviewBusinessProfile, plan: PreviewRenderPlan, hierarchy: PreviewServiceHierarchyItem[]) {
  const market = profile.primaryMarket.replace(/,\s*[A-Z]{2}$/i, "");
  const primary = hierarchy[0]?.title ?? profile.trade;
  const strategy = previewCopyStrategy(prospect, plan);
  const trade = profile.trade;
  const headlineSets: Partial<Record<TradeCategory, string[]>> = {
    "Pressure Washing": [
      `A cleaner exterior starts with ${profile.officialBusinessName}.`,
      `${primary} for homes around ${market}.`,
      `Refresh the surfaces people notice first.`,
    ],
    Landscaping: [
      `Outdoor spaces shaped for life in ${market}.`,
      `${primary} with the property in mind.`,
      `Give the outside of your home more purpose.`,
    ],
    HVAC: [
      `Comfort help for ${market} homes.`,
      `${primary} without the runaround.`,
      `Get the heating or cooling issue handled clearly.`,
    ],
    Roofing: [
      `A practical next step for your roof.`,
      `${primary} for ${market} homeowners.`,
      `Roofing help built around the condition of your home.`,
    ],
    Plumbing: [`Plumbing help for ${market} homes.`, `${primary} when the property needs it.`, `Start with the plumbing issue, then plan the right service.`],
    Electrical: [`Electrical help for ${market} properties.`, `${primary} with a clear next step.`, `Get the electrical work around your property handled.`],
    Painting: [`A cleaner finish for homes around ${market}.`, `${primary} with careful preparation.`, `Refresh the surfaces that shape the room or exterior.`],
    Concrete: [`Concrete work planned for the way the property is used.`, `${primary} for ${market} properties.`, `Start with the surface, scope, and practical next step.`],
  };
  const headlines = headlineSets[trade] ?? [`${primary} for ${market} properties.`, `${profile.officialBusinessName} serves ${market}.`, `A clearer start for ${primary.toLowerCase()}.`];
  const headline = headlines[strategy.variant] ?? headlines[0];
  const serviceNames = hierarchy.slice(0, 4).map((service) => service.title);
  const serviceList = naturalList(serviceNames.map((service) => service.toLowerCase()))
    .replace(/^./, (character) => character.toUpperCase());
  const supporting = trade === "Pressure Washing"
    ? `${serviceList} for homes across ${profile.verifiedServiceArea}.`
    : trade === "Landscaping"
      ? `${serviceList} for outdoor spaces across ${profile.verifiedServiceArea}.`
      : `${serviceList} across ${profile.verifiedServiceArea}.`;
  const tradeServicesLead: Partial<Record<TradeCategory, string>> = {
    "Pressure Washing": `Compare ${serviceList.toLowerCase()} and request an estimate for the exterior surfaces around your property.`,
    Landscaping: `Explore ${serviceList.toLowerCase()} and plan the work that fits the property and season.`,
    HVAC: `Choose the service that matches the comfort issue, equipment need, or planned system update.`,
    Roofing: `Start with the roof concern, then choose the repair, inspection, or replacement service that fits.`,
    Plumbing: `Start with the leak, drain, fixture, or equipment issue that needs attention.`,
    Electrical: `Choose the repair, installation, or upgrade that matches the electrical work at the property.`,
    Painting: `Compare the available painting services and request an estimate for the rooms or exterior surfaces involved.`,
    Concrete: `Choose the concrete service that matches the surface, dimensions, and intended use of the project.`,
  };
  const servicesLead = tradeServicesLead[trade] ?? (strategy.voice === "direct-service"
    ? `Start with the issue at the property and choose the service that fits.`
    : `See the available service, then contact the team to confirm the property and timing.`);
  const serviceAreaCopy = strategy.variant === 0
    ? `${profile.officialBusinessName} serves ${profile.verifiedServiceArea}. Contact the team to confirm availability for your property.`
    : strategy.variant === 1
      ? `Request ${primary.toLowerCase()} in ${profile.verifiedServiceArea} and confirm the project details directly with the team.`
      : `Homeowners and property owners across ${profile.verifiedServiceArea} can contact the team about ${primary.toLowerCase()}.`;
  return { strategy, headline, supporting, servicesLead, serviceAreaCopy };
}
