import {
  prospectWrittenContactMethodIsUsable,
  type Prospect,
} from "@/lib/prospect-engine";

export const prospectFunnelFilterKeys = [
  "total",
  "qualified",
  "qualified_unsent",
  "ready_email",
  "ready_facebook",
  "ready_instagram",
  "ready_contact_form",
  "high_priority",
  "already_contacted",
  "suppressed_do_not_contact",
  "bad_fit",
  "phone_only",
  "duplicate",
  "missing_contact_path",
  "website_already_strong",
  "other_not_actionable",
] as const;

export type ProspectFunnelFilterKey = (typeof prospectFunnelFilterKeys)[number];
export type ProspectFunnelBucketKey = Exclude<ProspectFunnelFilterKey, "total" | "qualified" | "qualified_unsent">;

export const prospectFunnelLabels: Record<ProspectFunnelFilterKey, string> = {
  total: "Total Prospects",
  qualified: "Qualified Prospects",
  qualified_unsent: "Qualified & Unsent",
  ready_email: "Ready for Email Review",
  ready_facebook: "Ready for Facebook Review",
  ready_instagram: "Ready for Instagram Review",
  ready_contact_form: "Ready for Contact Form Review",
  high_priority: "High Priority",
  already_contacted: "Already Contacted",
  suppressed_do_not_contact: "Suppressed / Do Not Contact",
  bad_fit: "Bad Fit",
  phone_only: "Phone Only",
  duplicate: "Duplicates",
  missing_contact_path: "Missing Contact Path",
  website_already_strong: "Website Already Strong",
  other_not_actionable: "Other / Not Currently Actionable",
};

const contactedStatuses = new Set<Prospect["status"]>(["Contacted", "Interested", "Proposal Sent", "Closed Won", "Closed Lost"]);

function noteText(prospect: Prospect) {
  return [
    ...prospect.notes,
    ...prospect.activities.map((item) => item.label),
    ...prospect.contactDiscoveryNotes,
  ].join(" ");
}

function isSuppressed(prospect: Prospect) {
  return prospect.recommendedContactMethod === "do_not_contact"
    || /\b(opted out|do not contact|never contact|unsubscribe|complaint|bounced|suppressed|not interested)\b/i.test(noteText(prospect));
}

function isDuplicate(prospect: Prospect) {
  return prospect.classification === "duplicate_bad_fit" || /\bduplicate\b/i.test(noteText(prospect));
}

function isBadFit(prospect: Prospect) {
  return prospect.inactive
    || prospect.classification === "national_large_brand"
    || /\b(bad fit|national|large brand|institution|supplier|distributor|mismatch)\b/i.test(noteText(prospect));
}

function isPhoneOnly(prospect: Prospect) {
  return prospect.classification === "phone_only" || prospect.recommendedContactMethod === "call_first" || prospect.bestManualContactMethod === "phone_only";
}

function hasFacebookPath(prospect: Prospect) {
  return Boolean(prospect.facebookUrl)
    || prospect.recommendedContactMethod === "message_on_facebook"
    || /facebook\.com/i.test(prospect.profileUrl);
}

function hasInstagramPath(prospect: Prospect) {
  return Boolean(prospect.instagramUrl)
    || (prospect.recommendedContactMethod === "message_on_social" && /instagram\.com/i.test(`${prospect.instagramUrl} ${prospect.profileUrl}`));
}

function hasContactFormPath(prospect: Prospect) {
  return Boolean(prospect.quoteFormUrl || prospect.contactFormUrl || prospect.quoteFormDetected || prospect.contactFormDetected)
    || prospect.recommendedContactMethod === "submit_contact_form";
}

function hasEmailPath(prospect: Prospect) {
  return Boolean(prospect.email) && prospect.recommendedContactMethod !== "verify_email_manually";
}

function isWebsiteAlreadyStrong(prospect: Prospect) {
  return Boolean(prospect.analysis && prospect.analysis.overallScore >= 85 && prospect.analysis.opportunityRating === "Low")
    || /\balready strong website|website already strong|strong website\b/i.test(noteText(prospect));
}

export function prospectIsQualified(prospect: Prospect) {
  if (isSuppressed(prospect) || isDuplicate(prospect) || isBadFit(prospect)) return false;
  if (isWebsiteAlreadyStrong(prospect)) return false;
  return prospect.status === "Reviewed"
    || prospect.priorityScore >= 50
    || Boolean(prospect.analysis || prospect.preview || prospect.outreach)
    || prospectWrittenContactMethodIsUsable(prospect);
}

export function prospectIsQualifiedUnsent(prospect: Prospect) {
  return prospectIsQualified(prospect) && !contactedStatuses.has(prospect.status) && !isSuppressed(prospect);
}

export function prospectCurrentBucket(prospect: Prospect): ProspectFunnelBucketKey {
  if (contactedStatuses.has(prospect.status)) return "already_contacted";
  if (isSuppressed(prospect)) return "suppressed_do_not_contact";
  if (isDuplicate(prospect)) return "duplicate";
  if (isBadFit(prospect)) return "bad_fit";
  if (isPhoneOnly(prospect)) return "phone_only";
  if (prospectIsQualifiedUnsent(prospect) && hasEmailPath(prospect)) return "ready_email";
  if (prospectIsQualifiedUnsent(prospect) && hasFacebookPath(prospect)) return "ready_facebook";
  if (prospectIsQualifiedUnsent(prospect) && hasInstagramPath(prospect)) return "ready_instagram";
  if (prospectIsQualifiedUnsent(prospect) && hasContactFormPath(prospect)) return "ready_contact_form";
  if (isWebsiteAlreadyStrong(prospect)) return "website_already_strong";
  if (prospectIsQualifiedUnsent(prospect) && prospect.priorityScore >= 70) return "high_priority";
  if (!prospectWrittenContactMethodIsUsable(prospect)) return "missing_contact_path";
  return "other_not_actionable";
}

export function prospectMatchesFunnelFilter(prospect: Prospect, filter: ProspectFunnelFilterKey | "all") {
  if (filter === "all" || filter === "total") return true;
  if (filter === "qualified") return prospectIsQualified(prospect);
  if (filter === "qualified_unsent") return prospectIsQualifiedUnsent(prospect);
  if (filter === "high_priority") return prospectIsQualifiedUnsent(prospect) && prospect.priorityScore >= 70;
  if (filter === "ready_email") return prospectIsQualifiedUnsent(prospect) && hasEmailPath(prospect);
  if (filter === "ready_facebook") return prospectIsQualifiedUnsent(prospect) && hasFacebookPath(prospect);
  if (filter === "ready_instagram") return prospectIsQualifiedUnsent(prospect) && hasInstagramPath(prospect);
  if (filter === "ready_contact_form") return prospectIsQualifiedUnsent(prospect) && hasContactFormPath(prospect);
  return prospectCurrentBucket(prospect) === filter;
}

export function explainProspectBucket(prospect: Prospect) {
  const currentBucket = prospectCurrentBucket(prospect);
  const eligibleFor = {
    email: prospectIsQualifiedUnsent(prospect) && hasEmailPath(prospect),
    facebook: prospectIsQualifiedUnsent(prospect) && hasFacebookPath(prospect),
    instagram: prospectIsQualifiedUnsent(prospect) && hasInstagramPath(prospect),
    contactForm: prospectIsQualifiedUnsent(prospect) && hasContactFormPath(prospect),
  };
  const reasons: string[] = [];
  if (prospectIsQualified(prospect)) reasons.push("Qualified");
  if (prospectIsQualifiedUnsent(prospect)) reasons.push("Not contacted");
  if (hasEmailPath(prospect)) reasons.push("Public business email found");
  if (hasFacebookPath(prospect)) reasons.push("Facebook page found");
  if (hasInstagramPath(prospect)) reasons.push("Instagram path found");
  if (hasContactFormPath(prospect)) reasons.push("Contact or quote form found");
  if (prospect.analysis) reasons.push(`${prospect.analysis.opportunityRating} website opportunity`);
  if (prospect.priorityScore >= 70) reasons.push("High priority score");

  const blockedBecause: string[] = [];
  if (currentBucket === "already_contacted") blockedBecause.push("Already contacted or closed in the pipeline.");
  if (currentBucket === "suppressed_do_not_contact") blockedBecause.push("Suppressed, opted out, bounced, complained, or marked do-not-contact.");
  if (currentBucket === "duplicate") blockedBecause.push("Existing business already stored or marked duplicate.");
  if (currentBucket === "bad_fit") blockedBecause.push("Not a clear local service-business fit.");
  if (currentBucket === "phone_only") blockedBecause.push("No written contact path is available.");
  if (currentBucket === "missing_contact_path") blockedBecause.push("No email, contact form, Facebook, Instagram, or LinkedIn path is available.");
  if (currentBucket === "website_already_strong") blockedBecause.push("Website already appears strong enough that outreach is low priority.");
  if (currentBucket === "other_not_actionable") blockedBecause.push("Needs more review before it can enter a clear outreach bucket.");
  if (["ready_email", "ready_facebook", "ready_instagram", "ready_contact_form", "high_priority"].includes(currentBucket)) {
    blockedBecause.push("Human review is still required before any outreach.");
  }

  const nextStep =
    currentBucket === "ready_email" ? "Review the package, verify the email, then approve manual email only if it is accurate."
      : currentBucket === "ready_facebook" ? "Review the package and use the Facebook DM draft manually."
        : currentBucket === "ready_instagram" ? "Review the package and use the Instagram DM draft manually."
          : currentBucket === "ready_contact_form" ? "Review the package and use the contact-form draft manually."
            : currentBucket === "high_priority" ? "Review contact details and package quality before choosing a manual channel."
              : currentBucket === "phone_only" || currentBucket === "missing_contact_path" ? "Find a written contact path or leave it blocked."
                : currentBucket === "website_already_strong" ? "Skip unless you find a specific conversion issue worth a manual note."
                  : currentBucket === "already_contacted" ? "Continue from the pipeline history instead of starting new outreach."
                    : currentBucket === "suppressed_do_not_contact" ? "Do not contact."
                      : currentBucket === "duplicate" ? "Use the existing stored business record."
                        : currentBucket === "bad_fit" ? "Leave blocked unless the business fit is manually corrected."
                          : "Review manually and update contact/path details.";

  return {
    currentBucket,
    currentBucketLabel: prospectFunnelLabels[currentBucket],
    eligibleFor,
    reasons: reasons.length ? reasons : [prospectFunnelLabels[currentBucket]],
    blockedBecause,
    nextStep,
  };
}

export function buildProspectFunnel(prospects: Prospect[]) {
  const counts = Object.fromEntries(prospectFunnelFilterKeys.map((key) => [key, 0])) as Record<ProspectFunnelFilterKey, number>;
  const exclusiveBuckets = Object.fromEntries(
    prospectFunnelFilterKeys
      .filter((key) => key !== "total" && key !== "qualified" && key !== "qualified_unsent")
      .map((key) => [key, 0]),
  ) as Record<ProspectFunnelBucketKey, number>;
  for (const prospect of prospects) {
    counts.total += 1;
    if (prospectIsQualified(prospect)) counts.qualified += 1;
    if (prospectIsQualifiedUnsent(prospect)) counts.qualified_unsent += 1;
    for (const key of prospectFunnelFilterKeys) {
      if (["total", "qualified", "qualified_unsent"].includes(key)) continue;
      if (prospectMatchesFunnelFilter(prospect, key)) counts[key] += 1;
    }
    exclusiveBuckets[prospectCurrentBucket(prospect)] += 1;
  }
  const blocked = exclusiveBuckets.bad_fit
    + exclusiveBuckets.phone_only
    + exclusiveBuckets.duplicate
    + exclusiveBuckets.missing_contact_path
    + exclusiveBuckets.website_already_strong
    + exclusiveBuckets.other_not_actionable;
  const exclusiveTotal = Object.values(exclusiveBuckets).reduce((sum, count) => sum + count, 0);
  const recommendation = counts.qualified_unsent > 0
    ? `You currently have ${counts.total} total prospects, ${counts.qualified_unsent} qualified unsent prospects, ${counts.ready_email} email-ready, ${counts.ready_facebook} Facebook-ready, and ${counts.ready_instagram} Instagram-ready. Because you already have qualified inventory, work these before running another market scan.`
    : `You currently have ${counts.total} total prospects, but no qualified unsent inventory is ready. Run a small targeted scan or fix missing contact paths before scaling.`;
  return {
    counts,
    exclusiveBuckets,
    currentInventory: {
      totalProspects: counts.total,
      qualifiedProspects: counts.qualified,
      qualifiedUnsent: counts.qualified_unsent,
      emailReady: counts.ready_email,
      facebookReady: counts.ready_facebook,
      instagramReady: counts.ready_instagram,
      needsManualResearch: counts.missing_contact_path,
      alreadyContacted: counts.already_contacted,
      blocked,
      suppressed: counts.suppressed_do_not_contact,
      highPriority: counts.high_priority,
    },
    diagnostics: {
      exclusiveTotal,
      reconciles: exclusiveTotal === counts.total,
      removedAtEachStage: {
        duplicate: exclusiveBuckets.duplicate,
        badFit: exclusiveBuckets.bad_fit,
        missingContact: exclusiveBuckets.missing_contact_path,
        strongWebsite: exclusiveBuckets.website_already_strong,
        suppressed: exclusiveBuckets.suppressed_do_not_contact,
        contacted: exclusiveBuckets.already_contacted,
        phoneOnly: exclusiveBuckets.phone_only,
        qualified: counts.qualified,
        readyForOutreach: counts.ready_email + counts.ready_facebook + counts.ready_instagram + counts.ready_contact_form,
      },
    },
    recommendation,
  };
}
