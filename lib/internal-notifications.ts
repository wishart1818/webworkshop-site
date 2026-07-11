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

export type InternalSmsEnvironment = {
  enabled: boolean;
  configured: boolean;
  hasTwilioAccountSid: boolean;
  hasTwilioAuthToken: boolean;
  hasTwilioFromPhone: boolean;
  hasOperatorPhone: boolean;
  maskedOperatorPhone: string;
};

export type InternalNotificationResult = {
  sent: boolean;
  configured: boolean;
  toOperatorOnly: boolean;
  providerMessageId?: string;
  blockedReasons: string[];
};

export type InternalSmsResult = InternalNotificationResult & {
  maskedTo?: string;
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

export function maskOperatorPhone(phone: string | undefined) {
  const trimmed = phone?.trim() ?? "";
  if (!trimmed) return "missing";
  const digits = trimmed.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  const country = trimmed.startsWith("+") ? `+${digits.slice(0, Math.max(1, digits.length - 10)) || "1"}` : "";
  return `${country}*****${last4 || "????"}`;
}

export function internalSmsEnvironment(environment: NodeJS.ProcessEnv = process.env): InternalSmsEnvironment {
  const enabled = environment.SMS_NOTIFICATIONS_ENABLED === "true";
  const hasTwilioAccountSid = Boolean(environment.TWILIO_ACCOUNT_SID?.trim());
  const hasTwilioAuthToken = Boolean(environment.TWILIO_AUTH_TOKEN?.trim());
  const hasTwilioFromPhone = Boolean(environment.TWILIO_FROM_PHONE?.trim());
  const hasOperatorPhone = Boolean(environment.INTERNAL_NOTIFY_PHONE?.trim());
  return {
    enabled,
    configured: enabled && hasTwilioAccountSid && hasTwilioAuthToken && hasTwilioFromPhone && hasOperatorPhone,
    hasTwilioAccountSid,
    hasTwilioAuthToken,
    hasTwilioFromPhone,
    hasOperatorPhone,
    maskedOperatorPhone: maskOperatorPhone(environment.INTERNAL_NOTIFY_PHONE),
  };
}

function appBaseUrl(environment: NodeJS.ProcessEnv = process.env) {
  return (environment.NEXT_PUBLIC_APP_URL || environment.NEXT_PUBLIC_SITE_URL || "https://webworkshop.dev").replace(/\/+$/, "");
}

function operatorUrl(pagePath: string | undefined, environment: NodeJS.ProcessEnv = process.env) {
  if (!pagePath) return "";
  if (/^https?:\/\//i.test(pagePath)) return pagePath;
  return `${appBaseUrl(environment)}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`;
}

function redactPhoneNumbers(value: string) {
  return value.replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone redacted]");
}

export function internalNotificationBody(input: InternalNotificationInput) {
  return [
    input.title,
    input.marketTrade ? `Market/trade: ${input.marketTrade}` : "",
    typeof input.resultCount === "number" ? `Result count: ${input.resultCount}` : "",
    `Needs attention: ${input.attention}`,
    `Next action: ${input.nextAction}`,
    input.pagePath ? `Open: ${input.pagePath}` : "",
  ].filter(Boolean).map(redactPhoneNumbers).join("\n");
}

export function internalSmsBody(input: InternalNotificationInput, environment: NodeJS.ProcessEnv = process.env) {
  const body = [
    `WebWorkshop: ${input.title}`,
    input.marketTrade ?? "",
    typeof input.resultCount === "number" ? `${input.resultCount} result${input.resultCount === 1 ? "" : "s"}` : "",
    input.attention,
    `Next: ${input.nextAction}`,
    input.pagePath ? `Open: ${operatorUrl(input.pagePath, environment)}` : "",
  ].filter(Boolean).map(redactPhoneNumbers).join("\n");
  if (body.length <= 600) return body;
  return `${body.slice(0, 520).trim()}\nOpen: ${operatorUrl("/engine?tab=operator-test-center", environment)}`;
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

export function internalSmsConfiguredLabel(environment: NodeJS.ProcessEnv = process.env) {
  const env = internalSmsEnvironment(environment);
  if (env.configured) return "configured";
  if (!env.enabled) return "disabled";
  return "needs Twilio/from/phone";
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

export async function sendInternalOperatorSms(
  input: InternalNotificationInput,
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<InternalSmsResult> {
  const env = internalSmsEnvironment(environment);
  const blockedReasons = [
    !env.enabled ? "SMS_NOTIFICATIONS_ENABLED is not true." : "",
    !env.hasTwilioAccountSid ? "TWILIO_ACCOUNT_SID is missing." : "",
    !env.hasTwilioAuthToken ? "TWILIO_AUTH_TOKEN is missing." : "",
    !env.hasTwilioFromPhone ? "TWILIO_FROM_PHONE is missing." : "",
    !env.hasOperatorPhone ? "INTERNAL_NOTIFY_PHONE is missing." : "",
  ].filter(Boolean);
  if (blockedReasons.length) {
    return { sent: false, configured: env.configured, toOperatorOnly: true, blockedReasons, maskedTo: env.maskedOperatorPhone };
  }

  try {
    const accountSid = environment.TWILIO_ACCOUNT_SID?.trim() ?? "";
    const authToken = environment.TWILIO_AUTH_TOKEN?.trim() ?? "";
    const body = new URLSearchParams({
      From: environment.TWILIO_FROM_PHONE?.trim() ?? "",
      To: environment.INTERNAL_NOTIFY_PHONE?.trim() ?? "",
      Body: internalSmsBody(input, environment),
    });
    const response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}.`);
    const payload = await response.json().catch(() => ({})) as { sid?: string };
    return { sent: true, configured: true, toOperatorOnly: true, blockedReasons: [], providerMessageId: payload.sid ?? "", maskedTo: env.maskedOperatorPhone };
  } catch (error) {
    return {
      sent: false,
      configured: env.configured,
      toOperatorOnly: true,
      blockedReasons: [safeInternalFailure(error)],
      maskedTo: env.maskedOperatorPhone,
    };
  }
}
