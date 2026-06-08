import {
  prospectStatuses,
  scoreLabels,
  tradeCategories,
  type Activity,
  type Analysis,
  type OutreachDraft,
  type PreviewConcept,
  type Prospect,
  type ProspectStatus,
  type ScoreKey,
  type TradeCategory,
} from "@/lib/prospect-engine";

type ValidationResult = { ok: true; value: Prospect } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, maxLength: number, required = true) {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const result = value.trim();
  if (required && !result) throw new Error(`${field} is required.`);
  if (result.length > maxLength) throw new Error(`${field} is too long.`);
  return result;
}

function dateText(value: unknown, field: string) {
  const result = text(value, field, 100);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${field} must be a valid date.`);
  return new Date(result).toISOString();
}

function stringArray(value: unknown, field: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} must be a valid list.`);
  return value.map((item) => text(item, field, maxLength));
}

function analysisValue(value: unknown): Analysis | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.scores)) throw new Error("Analysis must be a valid object.");
  const scores = {} as Record<ScoreKey, number>;
  for (const key of Object.keys(scoreLabels) as ScoreKey[]) {
    const score = Number(value.scores[key]);
    if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error("Analysis scores must be integers from 0 to 100.");
    scores[key] = score;
  }
  const overallScore = Number(value.overallScore);
  if (!Number.isInteger(overallScore) || overallScore < 0 || overallScore > 100) throw new Error("Analysis overall score must be an integer from 0 to 100.");
  const opportunityRating = text(value.opportunityRating, "Opportunity rating", 20) as Analysis["opportunityRating"];
  if (!["High", "Medium", "Low"].includes(opportunityRating)) throw new Error("Opportunity rating is not supported.");
  return {
    overallScore,
    opportunityRating,
    scores,
    strengths: stringArray(value.strengths, "Analysis strengths", 20, 1000),
    weaknesses: stringArray(value.weaknesses, "Analysis weaknesses", 20, 1000),
    summary: text(value.summary, "Analysis summary", 5000),
    redesignDirection: text(value.redesignDirection, "Redesign direction", 5000),
    analyzedAt: dateText(value.analyzedAt, "Analysis date"),
  };
}

function outreachValue(value: unknown): OutreachDraft | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.approved !== "boolean") throw new Error("Outreach draft must be a valid object.");
  return {
    subjects: stringArray(value.subjects, "Outreach subjects", 10, 300),
    concise: text(value.concise, "Concise outreach", 20_000),
    detailed: text(value.detailed, "Detailed outreach", 40_000),
    followUps: stringArray(value.followUps, "Outreach follow-ups", 10, 20_000),
    approved: value.approved,
    generatedAt: dateText(value.generatedAt, "Outreach generated date"),
  };
}

function previewValue(value: unknown): PreviewConcept | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Preview concept must be a valid object.");
  return {
    direction: text(value.direction, "Preview direction", 5000),
    visualStyleDirection: text(value.visualStyleDirection ?? "Practical contractor visual direction.", "Visual style direction", 5000),
    hero: text(value.hero, "Preview hero", 5000),
    homepageStructure: stringArray(value.homepageStructure, "Homepage structure", 20, 1000),
    ctaStrategy: text(value.ctaStrategy, "CTA strategy", 5000),
    servicePageStructure: stringArray(value.servicePageStructure, "Service page structure", 20, 1000),
    portfolioDirection: text(value.portfolioDirection, "Portfolio direction", 5000),
    trustStrategy: text(value.trustStrategy, "Trust strategy", 5000),
    leadCaptureStrategy: text(value.leadCaptureStrategy, "Lead capture strategy", 5000),
    generatedAt: dateText(value.generatedAt, "Preview generated date"),
  };
}

function activityValues(value: unknown): Activity[] {
  if (!Array.isArray(value) || value.length > 2000) throw new Error("Activities must be a valid list.");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("Activity must be a valid object.");
    const type = text(item.type, "Activity type", 30) as Activity["type"];
    if (!["created", "analysis", "outreach", "preview", "status", "note"].includes(type)) throw new Error("Activity type is not supported.");
    return {
      id: text(item.id, "Activity ID", 100),
      type,
      label: text(item.label, "Activity label", 1000),
      at: dateText(item.at, "Activity date"),
    };
  });
}

export function validateProspect(input: unknown): ValidationResult {
  try {
    if (!isRecord(input)) throw new Error("Prospect payload must be an object.");

    const website = text(input.website, "Website", 2048);
    const parsedUrl = new URL(website);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Website must use HTTP or HTTPS.");
    if (parsedUrl.username || parsedUrl.password) throw new Error("Website cannot include credentials.");
    if (parsedUrl.port && !["80", "443"].includes(parsedUrl.port)) throw new Error("Website uses an unsupported port.");

    const trade = text(input.trade, "Trade", 40) as TradeCategory;
    if (!tradeCategories.includes(trade)) throw new Error("Trade category is not supported.");

    const status = text(input.status, "Status", 40) as ProspectStatus;
    if (!prospectStatuses.includes(status)) throw new Error("Pipeline status is not supported.");

    const sizeIndicator = text(input.sizeIndicator, "Business size", 20) as Prospect["sizeIndicator"];
    if (!["Small", "Growing", "Established"].includes(sizeIndicator)) throw new Error("Business size is not supported.");

    const priorityScore = Number(input.priorityScore);
    if (!Number.isInteger(priorityScore) || priorityScore < 0 || priorityScore > 100) {
      throw new Error("Priority score must be an integer from 0 to 100.");
    }

    const email = text(input.email, "Email", 254, false);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email must be valid.");

    return {
      ok: true,
      value: {
        id: text(input.id, "Prospect ID", 100),
        businessName: text(input.businessName, "Business name", 160),
        website: parsedUrl.href,
        phone: text(input.phone, "Phone", 50, false),
        email,
        city: text(input.city, "City", 100),
        state: text(input.state, "State", 2).toUpperCase(),
        trade,
        status,
        serviceArea: text(input.serviceArea, "Service area", 300),
        sizeIndicator,
        priorityScore,
        notes: stringArray(input.notes, "Notes", 1000, 5000),
        activities: activityValues(input.activities),
        analysis: analysisValue(input.analysis),
        outreach: outreachValue(input.outreach),
        preview: previewValue(input.preview),
        createdAt: dateText(input.createdAt, "Created date"),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid prospect payload." };
  }
}
