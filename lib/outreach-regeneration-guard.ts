export const staleWebsiteFitRegenerationReason = "current website-fit evidence no longer supports outreach regeneration";
export const genericOutreachRegenerationReason = "outreach copy regeneration failed safely";

export type OutreachRegenerationAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export function attemptOutreachCopyRegeneration<T>(input: {
  queueItemId: string;
  prospectId?: string;
  regenerate: () => T;
  warn?: (message: string, details: Record<string, string>) => void;
}): OutreachRegenerationAttempt<T> {
  try {
    return { ok: true, value: input.regenerate() };
  } catch (error) {
    const reason = error instanceof Error
      && /current evidence does not support website-rebuild outreach/i.test(error.message)
      ? staleWebsiteFitRegenerationReason
      : genericOutreachRegenerationReason;
    const warn = input.warn ?? console.warn;
    warn("[autonomous-growth] Outreach copy regeneration skipped safely.", {
      queueItemId: input.queueItemId,
      prospectId: input.prospectId ?? "",
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, reason };
  }
}
