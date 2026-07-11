export type InternalNotificationKind =
  | "approved_email_failed"
  | "approved_email_sent"
  | "auto_email_blocked"
  | "operator_test"
  | "outreach_package_ready"
  | "phone_only_blocked"
  | "prospect_interested"
  | "provider_issue"
  | "suppression_recorded"
  | "top_prospects_finished"
  | "zero_qualified_run";

export type InternalNotificationInput = {
  kind: InternalNotificationKind;
  title: string;
  marketTrade?: string;
  resultCount?: number;
  attention: string;
  nextAction: string;
  pagePath?: string;
};

export type InternalNotificationEnvironment = {
  enabled: boolean;
  configured: boolean;
  hasResendApiKey: boolean;
  hasNotifyEmail: boolean;
  hasNotifyFromEmail: boolean;
};

export type InternalNotificationResult = {
  sent: boolean;
  configured: boolean;
  toOperatorOnly: boolean;
  providerMessageId?: string;
  blockedReasons: string[];
};

export function internalNotificationEnvironment(environment: NodeJS.ProcessEnv = process.env): InternalNotificationEnvironment {
  const enabled = environment.INTERNAL_NOTIFICATIONS_ENABLED === "true";
  const hasResendApiKey = Boolean(environment.RESEND_API_KEY?.trim());
  const hasNotifyEmail = Boolean(environment.INTERNAL_NOTIFY_EMAIL?.trim());
  const hasNotifyFromEmail = Boolean(environment.INTERNAL_NOTIFY_FROM_EMAIL?.trim());
  return {
    enabled,
    configured: enabled && hasResendApiKey && hasNotifyEmail && hasNotifyFromEmail,
    hasResendApiKey,
    hasNotifyEmail,
    hasNotifyFromEmail,
  };
}
export function internalNotificationBody(input: InternalNotificationInput) {
  return [
    input.title,
    input.marketTrade ? `Market/trade: ${input.marketTrade}` : "",
    typeof input.resultCount === "number" ? `Result count: ${input.resultCount}` : "",
    `Needs attention: ${input.attention}`,
    `Next action: ${input.nextAction}`,
    input.pagePath ? `Open: ${input.pagePath}` : "",
  ].filter(Boolean).join("\n");
}

export function internalNotificationSubject(input: InternalNotificationInput) {
  return `WebWorkshop: ${input.title}`;
}

export function internalNotificationConfiguredLabel(environment: NodeJS.ProcessEnv = process.env) {
  const env = internalNotificationEnvironment(environment);
  if (env.configured) return "configured";
  if (!env.enabled) return "not configured";
  return "needs email/from/key";
}

function safeInternalFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/HTTP \d{3}/i.test(message)) return message;
  if (/not configured|disabled/i.test(message)) return message;
  return "Internal notification failed safely.";
}

export async function sendInternalOperatorNotification(
  input: InternalNotificationInput,
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<InternalNotificationResult> {
  const env = internalNotificationEnvironment(environment);
  const blockedReasons = [
    !env.enabled ? "INTERNAL_NOTIFICATIONS_ENABLED is not true." : "",
    !env.hasResendApiKey ? "RESEND_API_KEY is missing." : "",
    !env.hasNotifyEmail ? "INTERNAL_NOTIFY_EMAIL is missing." : "",
    !env.hasNotifyFromEmail ? "INTERNAL_NOTIFY_FROM_EMAIL is missing." : "",
  ].filter(Boolean);
  if (blockedReasons.length) {
    return { sent: false, configured: env.configured, toOperatorOnly: true, blockedReasons };
  }

  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${environment.RESEND_API_KEY?.trim() ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: environment.INTERNAL_NOTIFY_FROM_EMAIL?.trim(),
        to: [environment.INTERNAL_NOTIFY_EMAIL?.trim()],
        subject: internalNotificationSubject(input),
        text: internalNotificationBody(input),
      }),
    });
    if (!response.ok) throw new Error(`Internal notification provider returned HTTP ${response.status}.`);
    const payload = await response.json().catch(() => ({})) as { id?: string };
    return { sent: true, configured: true, toOperatorOnly: true, blockedReasons: [], providerMessageId: payload.id ?? "" };
  } catch (error) {
    return {
      sent: false,
      configured: env.configured,
      toOperatorOnly: true,
      blockedReasons: [safeInternalFailure(error)],
    };
  }
}
