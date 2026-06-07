import {
  prospectStatuses,
  tradeCategories,
  type Prospect,
  type ProspectStatus,
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

export function validateProspect(input: unknown): ValidationResult {
  try {
    if (!isRecord(input)) throw new Error("Prospect payload must be an object.");

    const website = text(input.website, "Website", 2048);
    const parsedUrl = new URL(website);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("Website must use HTTP or HTTPS.");

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

    return {
      ok: true,
      value: {
        ...(input as Prospect),
        id: text(input.id, "Prospect ID", 100),
        businessName: text(input.businessName, "Business name", 160),
        website: parsedUrl.href,
        phone: text(input.phone, "Phone", 50, false),
        email: text(input.email, "Email", 254, false),
        city: text(input.city, "City", 100),
        state: text(input.state, "State", 2).toUpperCase(),
        trade,
        status,
        serviceArea: text(input.serviceArea, "Service area", 300),
        sizeIndicator,
        priorityScore,
        notes: Array.isArray(input.notes) ? input.notes.map((note) => text(note, "Note", 5000)) : [],
        activities: Array.isArray(input.activities) ? input.activities : [],
        createdAt: text(input.createdAt, "Created date", 100),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid prospect payload." };
  }
}
