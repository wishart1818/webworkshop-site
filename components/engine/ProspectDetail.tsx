"use client";

import React, { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { EmptyState } from "@/components/engine/EngineStates";
import { explainProspectBucket } from "@/lib/prospect-funnel";
import {
  activity,
  displayStateCode,
  displayTradeCategory,
  previewStyleProfile,
  PREVIEW_GENERATOR_VERSION,
  OUTREACH_COPY_VERSION,
  outreachDraftLooksCurrent,
  priorityRationale,
  prospectHasUnusableWebsite,
  prospectPresenceLabels,
  prospectWrittenContactMethodIsUsable,
  prospectStatuses,
  scoreLabels,
  titleCaseLocation,
  websiteAvailabilityLabels,
  type Prospect,
  type ProspectClassification,
  type ProspectStatus,
  type RecommendedContactMethod,
  type ScoreKey,
} from "@/lib/prospect-engine";
import { resolvePreviewImages } from "@/lib/preview-image-resolver";
import { evaluatePreviewSendWorthiness } from "@/lib/preview-send-worthiness";
import { calculateNoWebsitePresenceScores } from "@/lib/top-prospects";

const classificationLabels: Record<ProspectClassification, string> = {
  website_redesign: "Website Redesign Prospect",
  no_website: "No Website Prospect",
  social_only: "Social-Only Prospect",
  listing_only: "Listing-Only Prospect",
  phone_only: "Phone-Only Prospect",
  not_enough_contact_info: "Not Enough Contact Info",
  national_large_brand: "National/Large Brand",
  duplicate_bad_fit: "Duplicate/Bad Fit",
};

const contactMethodLabels: Record<RecommendedContactMethod, string> = {
  send_email: "Send email",
  submit_contact_form: "Submit contact form",
  message_on_facebook: "Message on Facebook",
  message_on_social: "Message on social",
  verify_email_manually: "Verify email manually",
  call_first: "Call first",
  needs_manual_contact_research: "Needs manual contact research",
  do_not_contact: "Do not contact",
};

export type DetailTab = "Analysis" | "Outreach" | "Preview" | "Activity" | "Details";
type PreviewRegenerationResult = { ok: boolean; message: string };

type ProspectDetailProps = {
  prospect: Prospect;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  onAnalyze: () => void;
  onPresenceGap: () => void;
  onOutreach: () => void;
  onRegenerateOutreach: () => Promise<void>;
  onRegeneratePreview: (feedback?: string) => Promise<PreviewRegenerationResult | void>;
  onCreateReviewPackage: () => Promise<void>;
  onPreview: () => void;
  onStatus: (status: ProspectStatus) => void;
  previewRegenerating?: boolean;
  previewImprovementSignal?: number;
  onClose?: () => void;
  note: string;
  setNote: (value: string) => void;
  addNote: (event: FormEvent) => void;
  updateSelected: (updater: (prospect: Prospect) => Prospect) => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function safeWebsiteUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

export function publicPreviewUrlForProspect(prospect: Pick<Prospect, "outreach">) {
  const source = [
    prospect.outreach?.concise,
    prospect.outreach?.detailed,
    ...(prospect.outreach?.followUps ?? []),
  ].filter(Boolean).join("\n");
  for (const match of source.matchAll(/(?:https?:\/\/[^\s"'<>)]*)?\/p\/([A-Za-z0-9_-]{24,})/g)) {
    const token = match[1];
    if (token) return `/p/${token}`;
  }
  return "";
}

function prospectLocationLine(prospect: Pick<Prospect, "trade" | "city" | "state">) {
  return `${displayTradeCategory(prospect.trade)} · ${titleCaseLocation(prospect.city)}, ${displayStateCode(prospect.state)}`;
}

const previewImprovementOptions = [
  "Replace repeated images",
  "Use more relevant service photos",
  "Stronger hero",
  "More premium design",
  "Less template-like layout",
  "Use branding more clearly",
  "Reduce text",
  "Improve mobile layout",
];

const previewImprovementFeedback: Record<string, string> = {
  "Replace repeated images": "Replace repeated images with distinct, service-specific photos. Prefer fewer relevant photos over reusing one image across major sections.",
  "Use more relevant service photos": "Use stronger service-specific photos that visibly match the nearby section and trade.",
  "Stronger hero": "Make the hero feel more specific, image-led, and credible for this business.",
  "More premium design": "Make the visual design feel more polished and premium without adding fake claims.",
  "Less template-like layout": "Vary the section rhythm so the page feels custom instead of like repeated blocks.",
  "Use branding more clearly": "Use the prospect-specific palette and brand direction more clearly.",
  "Reduce text": "Tighten the copy and make the page easier to scan.",
  "Improve mobile layout": "Improve mobile spacing, readability, and action visibility.",
};

function suggestedPreviewFeedback(primaryWarning: string) {
  if (/one image is used across too much|repeats one image|repeated image/i.test(primaryWarning)) return previewImprovementFeedback["Replace repeated images"];
  if (/too few trade-relevant photos|service-specific photos|image|photo/i.test(primaryWarning)) return previewImprovementFeedback["Use more relevant service photos"];
  if (/hero/i.test(primaryWarning)) return previewImprovementFeedback["Stronger hero"];
  if (/layout|template/i.test(primaryWarning)) return previewImprovementFeedback["Less template-like layout"];
  if (/mobile/i.test(primaryWarning)) return previewImprovementFeedback["Improve mobile layout"];
  return primaryWarning;
}

function initialPreviewOptions(primaryWarning: string) {
  if (/one image is used across too much|repeats one image|repeated image/i.test(primaryWarning)) return ["Replace repeated images"];
  if (/too few trade-relevant photos|service-specific photos|image|photo/i.test(primaryWarning)) return ["Use more relevant service photos"];
  if (/hero/i.test(primaryWarning)) return ["Stronger hero"];
  if (/layout|template/i.test(primaryWarning)) return ["Less template-like layout"];
  if (/mobile/i.test(primaryWarning)) return ["Improve mobile layout"];
  return [];
}

function ScoreRing({ value }: { value: number }) {
  return (
    <span className="engine-score" style={{ "--score": `${value * 3.6}deg` } as CSSProperties}>
      <b>{value}</b>
    </span>
  );
}

export function ProspectDetail({
  prospect,
  detailTab,
  setDetailTab,
  onAnalyze,
  onPresenceGap,
  onOutreach,
  onRegenerateOutreach,
  onRegeneratePreview,
  onCreateReviewPackage,
  onPreview,
  onStatus,
  previewRegenerating = false,
  previewImprovementSignal = 0,
  onClose,
  note,
  setNote,
  addNote,
  updateSelected,
}: ProspectDetailProps) {
  const [previewOpenMessage, setPreviewOpenMessage] = useState("");
  const [mobileActionMenuOpen, setMobileActionMenuOpen] = useState(false);
  const [localPreviewImprovementSignal, setLocalPreviewImprovementSignal] = useState(0);
  const detailBodyRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const presenceGap = prospectHasUnusableWebsite(prospect);
  const presenceLabels = prospectPresenceLabels(prospect);
  const publicPreviewUrl = publicPreviewUrlForProspect(prospect);
  const primaryAction = !prospect.analysis && prospect.websiteStatus === "unknown"
    ? { label: "Analyze website", action: onAnalyze }
    : !prospect.preview
      ? { label: "Generate preview", action: onPreview }
      : !prospect.outreach
        ? { label: "Generate outreach", action: onOutreach }
        : !prospect.outreach.approved
          ? { label: "Review draft", action: () => setDetailTab("Outreach") }
          : { label: "Mark reviewed", action: () => onStatus("Reviewed") };
  const mobilePrimaryAction = detailTab === "Preview" && prospect.preview
    ? !publicPreviewUrl
      ? { label: "Create public preview", action: onCreateReviewPackage }
      : { label: "Improve preview", action: () => setLocalPreviewImprovementSignal(Date.now()) }
    : primaryAction;

  function openPublicPreview() {
    if (publicPreviewUrl) {
      setPreviewOpenMessage("");
      window.location.assign(publicPreviewUrl);
      return;
    }
    setPreviewOpenMessage("No public preview link is available yet. Create or refresh the Autonomous Review Package to generate the prospect-safe /p/ preview.");
  }

  useEffect(() => {
    setMobileActionMenuOpen(false);
    setPreviewOpenMessage("");
    detailBodyRef.current?.scrollTo({ top: 0 });
  }, [prospect.id]);

  useEffect(() => {
    if (!mobileActionMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!mobileMenuRef.current?.contains(event.target as Node)) setMobileActionMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileActionMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileActionMenuOpen]);

  return (
    <aside className="engine-detail">
      <header className="engine-detail__hero">
        <div className="engine-detail__identity">
          <span>{prospect.businessName.charAt(0)}</span>
          <div>
            <h2>{prospect.businessName}</h2>
            <p>{prospectLocationLine(prospect)}</p>
            <small>{priorityRationale(prospect)}</small>
          </div>
        </div>
        <ScoreRing value={prospect.priorityScore} />
        {onClose ? <button className="engine-detail__close" onClick={onClose} type="button">Close record</button> : null}
      </header>
      <div className="engine-detail__meta">
        {prospect.website
          ? <a href={safeWebsiteUrl(prospect.website)} rel="noreferrer" target="_blank">Open website</a>
          : prospect.profileUrl
            ? <a href={safeWebsiteUrl(prospect.profileUrl)} rel="noreferrer" target="_blank">Open public profile</a>
            : <span>No owned website</span>}
        {prospect.phone ? <a href={`tel:${prospect.phone}`}>{prospect.phone}</a> : <span>No public phone</span>}
        {prospect.email ? <a href={`mailto:${prospect.email}`}>{prospect.email}</a> : <span>No public email</span>}
        {prospect.contactFormUrl ? <a href={safeWebsiteUrl(prospect.contactFormUrl)} rel="noreferrer" target="_blank">Open contact form</a> : null}
        {prospect.preview ? <button className="engine-detail-link-button" onClick={openPublicPreview} type="button">Open preview</button> : null}
        <span className={`engine-website-state engine-website-state--${prospect.websiteStatus}`}>{websiteAvailabilityLabels[prospect.websiteStatus]}</span>
        <select aria-label="Pipeline status" onChange={(event) => onStatus(event.target.value as ProspectStatus)} value={prospect.status}>
          {prospectStatuses.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {presenceLabels.length > 0 && <div className="engine-prospect-labels" aria-label="Prospect presence labels" role="list">{presenceLabels.map((label) => <span key={label} role="listitem">{label}</span>)}</div>}
      <ContactExplanation prospect={prospect} />
      <nav className="engine-tabs" aria-label="Prospect detail">
        {(["Analysis", "Outreach", "Preview", "Activity", "Details"] as DetailTab[]).map((tab) => (
          <button className={detailTab === tab ? "is-active" : ""} key={tab} onClick={() => setDetailTab(tab)} type="button">
            {tab === "Analysis" ? "Summary" : tab}
          </button>
        ))}
      </nav>
      <div className="engine-detail__body" ref={detailBodyRef}>
        {detailTab === "Analysis" && (presenceGap
          ? <PresenceGapView onAnalyze={onAnalyze} onPresenceGap={onPresenceGap} prospect={prospect} />
          : prospect.analysis
          ? <AnalysisView prospect={prospect} onAnalyze={onAnalyze} />
          : <UnanalyzedWebsiteView onAnalyze={onAnalyze} onPresenceGap={onPresenceGap} />)}
        {detailTab === "Outreach" && (prospect.outreach
          ? <OutreachView prospect={prospect} updateSelected={updateSelected} onRegenerateOutreach={onRegenerateOutreach} onCreateReviewPackage={onCreateReviewPackage} />
          : <EmptyState title="No outreach draft yet" body={prospect.prospectType === "no_website_social_only" ? "Generate an ownership-focused draft grounded in the public business profile. It will stay unsent until approved." : "Generate a personal draft grounded in the website analysis. It will stay unsent until approved."} action={onOutreach} actionLabel="Generate outreach" />)}
        {detailTab === "Preview" && (prospect.preview
          ? <PreviewView prospect={prospect} onCreateReviewPackage={onCreateReviewPackage} onOpenPublicPreview={openPublicPreview} onRegeneratePreview={onRegeneratePreview} onReviewOutreach={() => setDetailTab("Outreach")} previewRegenerating={previewRegenerating} previewImprovementSignal={Math.max(previewImprovementSignal, localPreviewImprovementSignal)} publicPreviewUrl={publicPreviewUrl} />
          : <EmptyState title="No preview concept yet" body="Create a contractor-specific page structure, visual direction, trust strategy, and lead-capture plan." action={onPreview} actionLabel="Generate preview concept" />)}
        {detailTab === "Activity" && <ActivityView prospect={prospect} note={note} setNote={setNote} addNote={addNote} />}
        {detailTab === "Details" && <DetailsView prospect={prospect} />}
      </div>
      {previewOpenMessage ? (
        <div className="engine-preview-action-alert" role="alert">
          <p>{previewOpenMessage}</p>
          <button className="engine-button" onClick={() => void onCreateReviewPackage()} type="button">Create/Refresh Review Package</button>
        </div>
      ) : null}
      <div className="engine-mobile-action-bar" aria-label="Mobile prospect actions">
        <button className="engine-button engine-button--primary" onClick={mobilePrimaryAction.action} type="button">{mobilePrimaryAction.label}</button>
        <details className="engine-action-menu engine-action-menu--up" open={mobileActionMenuOpen} onToggle={(event) => setMobileActionMenuOpen(event.currentTarget.open)} ref={mobileMenuRef}>
          <summary>More</summary>
          <div>
            <button onClick={() => { setMobileActionMenuOpen(false); setDetailTab("Outreach"); }} type="button">Open outreach</button>
            <button onClick={() => { setMobileActionMenuOpen(false); openPublicPreview(); }} type="button">Open preview</button>
            <button onClick={() => { setMobileActionMenuOpen(false); setDetailTab("Preview"); }} type="button">View internal Preview tab</button>
            <button onClick={() => { setMobileActionMenuOpen(false); setDetailTab("Preview"); setLocalPreviewImprovementSignal(Date.now()); }} type="button">Improve preview</button>
            <button onClick={() => { setMobileActionMenuOpen(false); void onRegenerateOutreach(); }} type="button">Rewrite outreach</button>
            <button onClick={() => { setMobileActionMenuOpen(false); void onCreateReviewPackage(); }} type="button">Create review package</button>
            <button onClick={() => { setMobileActionMenuOpen(false); onStatus("Reviewed"); }} type="button">Mark reviewed</button>
          </div>
        </details>
      </div>
    </aside>
  );
}

function DetailsView({ prospect }: { prospect: Prospect }) {
  return (
    <div className="engine-stack">
      <section>
        <h3>Business details</h3>
        <dl className="engine-detail-facts">
          <div><dt>Business</dt><dd>{prospect.businessName}</dd></div>
          <div><dt>Trade</dt><dd>{displayTradeCategory(prospect.trade)}</dd></div>
          <div><dt>Market</dt><dd>{titleCaseLocation(prospect.city)}, {displayStateCode(prospect.state)}</dd></div>
          <div><dt>Status</dt><dd>{prospect.status}</dd></div>
          <div><dt>Contact method</dt><dd>{contactMethodLabels[prospect.recommendedContactMethod]}</dd></div>
          <div><dt>Classification</dt><dd>{classificationLabels[prospect.classification]}</dd></div>
          <div><dt>Outreach draft</dt><dd>{prospect.outreach ? "Generated" : "Not generated"}</dd></div>
        </dl>
      </section>
      <ContactExplanation prospect={prospect} />
    </div>
  );
}

function ContactExplanation({ prospect }: { prospect: Prospect }) {
  const explanation = explainProspectBucket(prospect);
  return (
    <details className="engine-contact-explanation">
      <summary>Why isn&apos;t this being contacted?</summary>
      <div>
        <p><b>Current bucket:</b> {explanation.currentBucketLabel}</p>
        <dl>
          <div><dt>Email</dt><dd>{explanation.eligibleFor.email ? "Yes" : "No"}</dd></div>
          <div><dt>Facebook</dt><dd>{explanation.eligibleFor.facebook ? "Yes" : "No"}</dd></div>
          <div><dt>Instagram</dt><dd>{explanation.eligibleFor.instagram ? "Yes" : "No"}</dd></div>
          <div><dt>Contact Form</dt><dd>{explanation.eligibleFor.contactForm ? "Yes" : "No"}</dd></div>
        </dl>
        <section>
          <h3>Contact paths found</h3>
          <ul>
            <li>Email: {explanation.contactPaths.email ? "Yes" : "No"}</li>
            <li>Facebook: {explanation.contactPaths.facebook ? "Yes" : "No"}</li>
            <li>Instagram: {explanation.contactPaths.instagram ? "Yes" : "No"}</li>
            <li>LinkedIn: {explanation.contactPaths.linkedin ? "Yes" : "No"}</li>
            <li>Contact form: {explanation.contactPaths.contactForm ? "Yes" : "No"}</li>
            <li>Quote form: {explanation.contactPaths.quoteForm ? "Yes" : "No"}</li>
            <li>Phone: {explanation.contactPaths.phone ? "Yes" : "No"}</li>
          </ul>
        </section>
        <section>
          <h3>Status checks</h3>
          <ul>
            <li>Qualified: {explanation.qualification.qualified ? "Yes" : "No"}</li>
            <li>Unsent: {explanation.qualification.unsent ? "Yes" : "No"}</li>
            <li>Already contacted: {explanation.qualification.contacted ? "Yes" : "No"}</li>
            <li>Suppressed: {explanation.qualification.suppressed ? "Yes" : "No"}</li>
          </ul>
        </section>
        <section>
          <h3>Why this bucket</h3>
          <ul><li>{explanation.primaryReason}</li>{explanation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </section>
        {explanation.otherAttributes.length ? <p><b>Other attributes:</b> {explanation.otherAttributes.join(", ")}</p> : null}
        <section>
          <h3>Blocked because</h3>
          <ul>{explanation.blockedBecause.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </section>
        <p><b>Next step:</b> {explanation.nextStep}</p>
      </div>
    </details>
  );
}

function UnanalyzedWebsiteView({ onAnalyze, onPresenceGap }: Pick<ProspectDetailProps, "onAnalyze" | "onPresenceGap">) {
  return (
    <div className="engine-empty">
      <span aria-hidden="true">+</span>
      <h3>Website not analyzed yet</h3>
      <p>Analyze the website, or run Presence Gap review when the business has no usable owned website.</p>
      <div className="engine-empty__actions">
        <button className="engine-button engine-button--primary" onClick={onAnalyze} type="button">Analyze website</button>
        <button className="engine-button" onClick={onPresenceGap} type="button">Run No Website / Social-Only analysis</button>
      </div>
    </div>
  );
}

function PresenceGapView({ prospect, onAnalyze, onPresenceGap }: { prospect: Prospect; onAnalyze: () => void; onPresenceGap: () => void }) {
  const scores = calculateNoWebsitePresenceScores(prospect);
  return (
    <div className="engine-stack">
      <section>
        <h3>{websiteAvailabilityLabels[prospect.websiteStatus]}</h3>
        <p>{prospect.websiteStatusDetail || "No usable owned website was found."} The opportunity is to give this business a permanent online home instead of relying entirely on Facebook, Instagram, Google, or directory listings.</p>
      </section>
      <section>
        <h3>Presence and contact classification</h3>
        <p><b>{classificationLabels[prospect.classification]}</b>. Recommended contact: {contactMethodLabels[prospect.recommendedContactMethod]}.</p>
        {prospect.address && <p>Public address: {prospect.address}</p>}
      </section>
      <div className="engine-score-grid">
        <div><span>Presence Gap Score</span><b>{scores.onlinePresenceGapScore}</b><i><em style={{ width: `${scores.onlinePresenceGapScore}%` }} /></i></div>
        <div><span>Business Activity Score</span><b>{scores.businessActivityScore}</b><i><em style={{ width: `${scores.businessActivityScore}%` }} /></i></div>
        <div><span>Website Need Score</span><b>{scores.websiteNeedScore}</b><i><em style={{ width: `${scores.websiteNeedScore}%` }} /></i></div>
        <div><span>Contactability Score</span><b>{scores.contactabilityScore}</b><i><em style={{ width: `${scores.contactabilityScore}%` }} /></i></div>
        <div><span>Local Fit Score</span><b>{scores.localFitScore}</b><i><em style={{ width: `${scores.localFitScore}%` }} /></i></div>
        <div><span>Best outreach channel</span><b>{contactMethodLabels[prospect.recommendedContactMethod]}</b></div>
      </div>
      {prospect.activitySignals.length > 0 && <section><h3>Public activity signals</h3><ul>{prospect.activitySignals.map((signal) => <li key={signal}>{signal.replaceAll("_", " ")}</li>)}</ul></section>}
      <section><h3>Recommended pitch</h3><p>Lead with owning the customer journey: a clear services page, local proof, and direct estimate path that the business controls.</p></section>
      <div className="engine-inline-actions">
        {prospect.website && <button className="engine-button engine-button--primary" onClick={onAnalyze} type="button">Re-check website</button>}
        <button className="engine-button" onClick={onPresenceGap} type="button">Refresh Presence Gap analysis</button>
      </div>
    </div>
  );
}

function AnalysisView({ prospect, onAnalyze }: { prospect: Prospect; onAnalyze: () => void }) {
  const analysis = prospect.analysis!;
  return (
    <div className="engine-stack">
      <div className="engine-analysis-summary">
        <ScoreRing value={analysis.overallScore} />
        <div>
          <span className={`engine-opportunity engine-opportunity--${analysis.opportunityRating.toLowerCase()}`}>
            {analysis.opportunityRating} opportunity
          </span>
          <p>{analysis.summary}</p>
        </div>
      </div>
      <div className="engine-score-grid">
        {(Object.entries(analysis.scores) as [ScoreKey, number][]).map(([key, value]) => (
          <div key={key}>
            <span>{scoreLabels[key]}</span>
            <b>{value}</b>
            <i><em style={{ width: `${value}%` }} /></i>
          </div>
        ))}
      </div>
      <section><h3>Recommended redesign direction</h3><p>{analysis.redesignDirection}</p></section>
      <div className="engine-two-col">
        <section><h3>Strengths to reference</h3><ul>{analysis.strengths.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3>Conversion gaps</h3><ul>{analysis.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
      <button className="engine-button" onClick={onAnalyze} type="button">Re-run analysis</button>
    </div>
  );
}

function OutreachView({ prospect, updateSelected, onRegenerateOutreach, onCreateReviewPackage }: Pick<ProspectDetailProps, "prospect" | "updateSelected" | "onRegenerateOutreach" | "onCreateReviewPackage">) {
  const outreach = prospect.outreach!;
  const [complianceConfirmed, setComplianceConfirmed] = useState(false);
  const [copied, setCopied] = useState("");
  const writtenContactReady = prospectWrittenContactMethodIsUsable(prospect);
  const copyIsCurrent = outreachDraftLooksCurrent(outreach);
  const generatedDate = outreach.outreachCopyGeneratedAt || outreach.generatedAt;

  async function copyDraft(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("Copy unavailable");
    }
  }

  function toggleApproval() {
    updateSelected((item) => ({
      ...item,
      outreach: { ...outreach, approved: !outreach.approved },
      activities: [
        activity("outreach", outreach.approved ? "Outreach approval removed." : "Outreach approved after compliance review."),
        ...item.activities,
      ],
    }));
    setComplianceConfirmed(false);
  }

  return (
    <div className="engine-stack">
      <div className={`engine-approval ${outreach.approved ? "is-approved" : ""}`}>
        <div>
          <b>{outreach.approved ? "Approved for personal sending" : "Human review required"}</b>
          <p>{outreach.approved ? "This draft has been reviewed. Copy it into your normal email workflow after the sender postal address is configured." : "Review facts, tone, recipient details, sender identity, and opt-out handling before approving."}</p>
          <p><b>Exact email Auto Email Pilot would send.</b> Regenerated Prospect drafts and linked Autonomous Growth packages use this same current script.</p>
          <p>
            Copy version: <b>{outreach.outreachCopyVersion || "missing"}</b>{" "}
            <span className={`engine-status-pill ${copyIsCurrent ? "is-positive" : "is-warning"}`}>{copyIsCurrent ? "Current" : "Outdated"}</span>
            {" "}Generated: {generatedDate ? new Date(generatedDate).toLocaleString() : "Not recorded"}
          </p>
          {!writtenContactReady && <p className="engine-copy-warning">Written outreach is blocked for this prospect because no email, contact form, or social message path is available. Treat it as Needs manual contact research.</p>}
          {!copyIsCurrent && <p className="engine-copy-warning">This draft cannot be approved or queued until it is regenerated with {OUTREACH_COPY_VERSION}.</p>}
          {!outreach.approved && (
            <label className="engine-compliance-check">
              <input checked={complianceConfirmed} onChange={(event) => setComplianceConfirmed(event.target.checked)} type="checkbox" />
              <span>I verified the public contact source and truthful content, and I will add the sender postal address and honor opt-out requests before manual sending.</span>
            </label>
          )}
        </div>
        <button className="engine-button engine-button--primary" disabled={!copyIsCurrent || !writtenContactReady || (!outreach.approved && !complianceConfirmed)} onClick={toggleApproval} type="button">
          {outreach.approved ? "Remove approval" : "Approve personal draft"}
        </button>
      </div>
      <div className="engine-result-actions">
        <button className="engine-button" onClick={() => void onRegenerateOutreach()} type="button">Regenerate with Current Script</button>
        <button className="engine-button" onClick={() => void onCreateReviewPackage()} type="button">Create/Refresh Autonomous Review Package</button>
        <a className="engine-button" href="/engine?tab=autonomous-growth">Open linked Autonomous Growth package</a>
      </div>
      <section><h3>Subject options</h3><ul>{outreach.subjects.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <DraftSection approved={outreach.approved && copyIsCurrent} copied={copied} label="Exact first email" onCopy={copyDraft} value={outreach.concise} />
      <DraftSection approved={outreach.approved && copyIsCurrent} copied={copied} label="Yes reply with preview link" onCopy={copyDraft} value={outreach.detailed} />
      <section>
        <h3>Follow-up sequence</h3>
        {outreach.followUps.map((item, index) => (
          <DraftSection approved={outreach.approved} copied={copied} key={item} label={`Follow-up ${index + 1}`} onCopy={copyDraft} value={item} />
        ))}
      </section>
      <span aria-live="polite" className="sr-only">{copied}</span>
    </div>
  );
}

function DraftSection({ approved, copied, label, onCopy, value }: {
  approved: boolean;
  copied: string;
  label: string;
  onCopy: (label: string, value: string) => Promise<void>;
  value: string;
}) {
  const copiedLabel = `${label} draft copied`;
  return (
    <section>
      <div className="engine-copy-head">
        <h3>{label} {label.includes("Follow-up") ? "" : "version"}</h3>
        <button className="engine-button" disabled={!approved} onClick={() => void onCopy(copiedLabel, value)} type="button">
          {copied === copiedLabel ? "Copied" : `Copy ${label.toLowerCase()} draft`}
        </button>
      </div>
      <pre>{value}</pre>
    </section>
  );
}

function PreviewView({
  prospect,
  onCreateReviewPackage,
  onOpenPublicPreview,
  onRegeneratePreview,
  onReviewOutreach,
  previewRegenerating,
  previewImprovementSignal,
  publicPreviewUrl,
}: {
  prospect: Prospect;
  onCreateReviewPackage: () => Promise<void>;
  onOpenPublicPreview: () => void;
  onRegeneratePreview: (feedback?: string) => Promise<PreviewRegenerationResult | void>;
  onReviewOutreach: () => void;
  previewRegenerating: boolean;
  previewImprovementSignal: number;
  publicPreviewUrl: string;
}) {
  const preview = prospect.preview!;
  const [feedback, setFeedback] = useState("");
  const [improvementPanelOpen, setImprovementPanelOpen] = useState(false);
  const [selectedImprovements, setSelectedImprovements] = useState<string[]>([]);
  const [regenerationResult, setRegenerationResult] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const lastPreviewImprovementSignal = useRef(0);
  const improvementPanelRef = useRef<HTMLDivElement | null>(null);
  const styleProfile = previewStyleProfile(prospect, preview);
  const quality = preview.qualityScore;
  const artDirection = preview.artDirection;
  const creativeBrief = preview.creativeBrief;
  const businessProfile = preview.businessProfile;
  const services = [
    { title: preview.serviceHighlights?.[0] ?? displayTradeCategory(prospect.trade), description: "Primary service." },
    { title: preview.serviceHighlights?.[1] ?? "Service planning", description: "Secondary service." },
    { title: preview.serviceHighlights?.[2] ?? "Estimate request", description: "Supporting service." },
  ] as const;
  const imageSet = prospect.preview?.resolvedImages ?? resolvePreviewImages(prospect, services);
  const imageSummary = [
    imageSet.hero,
    ...imageSet.services,
    ...imageSet.gallery,
    imageSet.beforeAfter,
    imageSet.process,
    imageSet.cta,
  ];
  const sendWorthiness = evaluatePreviewSendWorthiness(prospect, {
    publicPreviewUrl,
    publicPreviewVerified: Boolean(publicPreviewUrl),
  });
  const palette = [
    ["Primary", styleProfile.primaryColor],
    ["Accent", styleProfile.accentColor],
    ["Surface", styleProfile.surfaceColor],
    ["Soft surface", styleProfile.softSurfaceColor],
    ["Text", styleProfile.inkColor],
  ];
  const busy = regenerating || previewRegenerating;

  function openImprovementPanel(seedFeedback = sendWorthiness.primaryWarning) {
    const suggested = suggestedPreviewFeedback(seedFeedback);
    const initialOptions = initialPreviewOptions(seedFeedback);
    setSelectedImprovements((current) => current.length ? current : initialOptions);
    setFeedback((current) => current.trim() ? current : suggested);
    setRegenerationResult("");
    setImprovementPanelOpen(true);
  }

  useEffect(() => {
    if (!previewImprovementSignal || lastPreviewImprovementSignal.current === previewImprovementSignal) return;
    lastPreviewImprovementSignal.current = previewImprovementSignal;
    const suggested = suggestedPreviewFeedback(sendWorthiness.primaryWarning);
    const initialOptions = initialPreviewOptions(sendWorthiness.primaryWarning);
    setSelectedImprovements((current) => current.length ? current : initialOptions);
    setFeedback((current) => current.trim() ? current : suggested);
    setRegenerationResult("");
    setImprovementPanelOpen(true);
  }, [previewImprovementSignal, sendWorthiness.primaryWarning]);

  useEffect(() => {
    if (!improvementPanelOpen) return;
    improvementPanelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [improvementPanelOpen]);

  function cancelImprovementPanel() {
    if (busy) return;
    setImprovementPanelOpen(false);
    setSelectedImprovements([]);
    setFeedback("");
  }

  function toggleImprovement(option: string) {
    if (busy) return;
    setSelectedImprovements((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    );
  }

  function combinedFeedback() {
    const selectedFeedback = selectedImprovements.map((option) => previewImprovementFeedback[option] ?? option);
    return [...selectedFeedback, feedback.trim()].filter(Boolean).join("\n\n");
  }

  async function regenerate(nextFeedback = combinedFeedback()) {
    if (regenerating || previewRegenerating) return;
    setRegenerating(true);
    setRegenerationResult("");
    try {
      const result = await onRegeneratePreview(nextFeedback);
      if (result?.ok === false) {
        setRegenerationResult(`${result.message} Previous preview was retained. Nothing was sent.`);
      } else {
        setRegenerationResult(result?.message || "Preview regeneration finished. Open the updated public preview to review it. Nothing was sent.");
        setImprovementPanelOpen(false);
        setSelectedImprovements([]);
        setFeedback("");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview regeneration failed.";
      setRegenerationResult(`${message} Previous preview was retained. Nothing was sent.`);
    } finally {
      setRegenerating(false);
    }
  }
  const primaryAction = !publicPreviewUrl
    ? { label: "Create public preview", action: onCreateReviewPackage, disabled: false }
    : sendWorthiness.verdict === "send_worthy"
      ? { label: "Review Outreach", action: onReviewOutreach, disabled: false }
      : { label: busy ? "Regenerating preview..." : sendWorthiness.nextAction, action: () => openImprovementPanel(), disabled: busy };

  return (
    <div className="engine-stack">
      <section className={`engine-preview-verdict engine-preview-verdict--${sendWorthiness.verdict}`} aria-label="Preview send-worthiness verdict">
        <div className="engine-preview-verdict__main">
          <span>{prospectLocationLine(prospect)}</span>
          <h3>{sendWorthiness.label}</h3>
          <p>{sendWorthiness.description}</p>
        </div>
        <div className="engine-preview-verdict__facts">
          <div><span>Most important issue</span><b>{sendWorthiness.primaryWarning}</b></div>
          <div><span>Freshness</span><b>{sendWorthiness.freshness}</b></div>
          <div><span>Images resolved</span><b>{sendWorthiness.resolvedImageCount}</b></div>
        </div>
        <div className="engine-preview-verdict__actions">
          <button className="engine-button engine-button--primary" disabled={primaryAction.disabled} onClick={() => void primaryAction.action()} type="button">{primaryAction.label}</button>
          {publicPreviewUrl ? <button className="engine-button" onClick={onOpenPublicPreview} type="button">Open Preview</button> : null}
        </div>
      </section>
      <section className="engine-preview-action-bar" aria-label="Preview actions">
        <div>
          <span>Improve preview</span>
          <h3>{prospect.businessName}</h3>
          <p>Use focused feedback when the visible public result is not strong enough to show the prospect. Nothing is sent.</p>
        </div>
        {improvementPanelOpen ? (
          <div className="engine-preview-improvement-panel" aria-label="Preview improvement feedback workflow" ref={improvementPanelRef}>
            <div>
              <span>Describe the visual fix</span>
              <h4>What should change before regenerating?</h4>
              <p>Select one or more fixes, add details, then confirm. Nothing is sent.</p>
            </div>
            <div className="engine-preview-chip-grid" aria-label="Focused preview improvements">
              {previewImprovementOptions.map((option) => (
                <button
                  aria-pressed={selectedImprovements.includes(option)}
                  className={`engine-chip-button ${selectedImprovements.includes(option) ? "is-selected" : ""}`}
                  disabled={busy}
                  key={option}
                  onClick={() => toggleImprovement(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
            <label className="engine-preview-feedback">
              <span>Custom feedback</span>
              <textarea onChange={(event) => setFeedback(event.target.value)} placeholder="Example: replace repeated imagery, make the hero stronger, and use more service-specific photos." value={feedback} />
            </label>
            <div className="engine-preview-improvement-panel__actions">
              <button className="engine-button" disabled={busy} onClick={cancelImprovementPanel} type="button">Cancel</button>
              <button className="engine-button engine-button--primary" disabled={busy || (!selectedImprovements.length && !feedback.trim())} onClick={() => void regenerate()} type="button">
                {busy ? "Regenerating preview..." : "Regenerate Preview"}
              </button>
            </div>
          </div>
        ) : null}
        <div className="engine-preview-action-bar__actions">
          {publicPreviewUrl
            ? <button className="engine-button engine-button--primary" onClick={onOpenPublicPreview} type="button">Open Public Preview</button>
            : <button className="engine-button engine-button--primary" onClick={() => void onCreateReviewPackage()} type="button">Create Public Preview</button>}
          <button className="engine-button" disabled={busy} onClick={() => openImprovementPanel()} type="button">{busy ? "Regenerating preview..." : "Improve Preview"}</button>
          <button className="engine-button" onClick={() => void onCreateReviewPackage()} type="button">Refresh Review Package</button>
        </div>
        {regenerationResult ? (
          <div className="engine-preview-action-alert" role="status">
            <p>{regenerationResult}</p>
            {publicPreviewUrl ? <button className="engine-button" onClick={onOpenPublicPreview} type="button">Open Updated Preview</button> : null}
          </div>
        ) : null}
      </section>
      {businessProfile ? (
        <section className="engine-preview-research-summary" aria-label="Business research summary">
          <div>
            <span>Business research summary</span>
            <h3>{businessProfile.officialBusinessName}</h3>
            <p>{businessProfile.confidenceSummary}</p>
          </div>
          <div className="engine-preview-research-summary__grid">
            <div><span>Logo</span><b>{businessProfile.logo.status === "available" ? `Using ${businessProfile.logo.source}` : "Text wordmark fallback"}</b></div>
            <div><span>Market</span><b>{businessProfile.primaryMarket}</b></div>
            <div><span>Services</span><b>{businessProfile.verifiedServices.slice(0, 3).join(", ")}</b></div>
            <div><span>Branding</span><b>{businessProfile.detectedBrandColors[0]?.source ?? "trade fallback"}</b></div>
            <div><span>Photos</span><b>{businessProfile.businessPhotoSources.length ? `${businessProfile.businessPhotoSources.length} approved business photos` : "No approved business photos"}</b></div>
            <div><span>Contact</span><b>{businessProfile.verifiedPublicEmailOrContactPath.value}</b></div>
          </div>
          <details>
            <summary>Sources, confidence, and excluded claims</summary>
            <div className="engine-preview-research-summary__details">
              <section>
                <h4>Source-backed facts</h4>
                <ul>{businessProfile.sourceFacts.slice(0, 10).map((fact) => <li key={`${fact.label}-${fact.value}`}><b>{fact.label}:</b> {fact.value} <span>({fact.source}, {fact.confidence})</span></li>)}</ul>
              </section>
              <section>
                <h4>Excluded unless verified</h4>
                <ul>{businessProfile.uncertainFactsExcluded.map((fact) => <li key={fact}>{fact}</li>)}</ul>
              </section>
              <section>
                <h4>Design direction</h4>
                <p>{businessProfile.recommendedDesignDirection}</p>
              </section>
            </div>
          </details>
          <p className="engine-muted-note">Need to correct a fact or visual direction? Use Improve Preview, add the correction, then regenerate. Nothing is sent.</p>
        </section>
      ) : (
        <section className="engine-preview-research-summary" aria-label="Business research summary">
          <div>
            <span>Business research summary</span>
            <h3>Not recorded for this preview</h3>
            <p>Regenerate the preview to create a source-backed business profile before using it for outreach review.</p>
          </div>
        </section>
      )}
      <section className="engine-preview-status-card">
        <div><span>Preview exists</span><b>Yes</b></div>
        <div><span>Generator</span><b>{preview.previewVersion === "v3" ? PREVIEW_GENERATOR_VERSION : preview.previewVersion || "legacy"}</b></div>
        <div><span>Generated</span><b>{preview.generatedAt ? new Date(preview.generatedAt).toLocaleString() : "Not recorded"}</b></div>
        <div><span>Public link</span><b>{publicPreviewUrl ? "Ready" : "Missing"}</b></div>
        <div><span>Verdict</span><b>{sendWorthiness.label}</b></div>
        <div><span>QA score</span><b>{quality?.overall ?? "N/A"}</b></div>
      </section>
      <section className="engine-preview-hero">
        <span>{displayTradeCategory(prospect.trade)} concept</span>
        <h3>{preview.direction}</h3>
        <p>{preview.hero}</p>
        <button type="button">{styleProfile.ctaLabel}</button>
      </section>
      <section className="engine-preview-style-profile">
        <div>
          <span>Prospect-specific style profile</span>
          <h3>{styleProfile.name}</h3>
          <p>{styleProfile.styleReason}</p>
        </div>
        <div className="engine-preview-palette" aria-label="Preview palette">
          {palette.map(([label, color]) => (
            <span key={label}>
              <i style={{ background: color }} />
              <b>{label}</b>
              <code>{color}</code>
            </span>
          ))}
        </div>
        <dl>
          <div><dt>Tone</dt><dd>{styleProfile.tone.replace("-", " ")}</dd></div>
          <div><dt>Layout</dt><dd>{styleProfile.layoutStyle.replace("-", " ")}</dd></div>
          <div><dt>Typography</dt><dd>{styleProfile.typographyStyle}</dd></div>
          <div><dt>Brand signal</dt><dd>{styleProfile.brandSource}</dd></div>
          <div><dt>Primary CTA</dt><dd>{styleProfile.ctaLabel}</dd></div>
          {artDirection ? <div><dt>Art direction</dt><dd>{artDirection.name}</dd></div> : null}
          {artDirection ? <div><dt>Hero treatment</dt><dd>{artDirection.heroTreatment.replaceAll("-", " ")}</dd></div> : null}
        </dl>
      </section>
      <details className="engine-preview-advanced">
        <summary>Advanced preview details</summary>
        <div className="engine-stack">
      {artDirection && (
        <section className="engine-preview-art-direction">
          <div>
            <span>Preview art direction</span>
            <h3>{artDirection.visualVoice}</h3>
            <p>{artDirection.sectionFlow}</p>
          </div>
          <dl>
            <div><dt>Image treatment</dt><dd>{artDirection.imageTreatment}</dd></div>
            <div><dt>Card style</dt><dd>{artDirection.cardStyle.replaceAll("-", " ")}</dd></div>
            <div><dt>CTA treatment</dt><dd>{artDirection.ctaTreatment}</dd></div>
            <div><dt>Interactive features</dt><dd>{artDirection.interactiveFeatures?.join(", ") || "Not recorded"}</dd></div>
            <div><dt>Imagery plan</dt><dd>{artDirection.imageryPlan?.join(", ") || "Not recorded"}</dd></div>
          </dl>
          {artDirection.qaWarnings?.length ? <p><b>QA warnings:</b> {artDirection.qaWarnings.join(", ")}</p> : null}
          <ul>{artDirection.reviewNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      )}
      {creativeBrief && (
        <section className="engine-preview-art-direction">
          <div>
            <span>Creative brief</span>
            <h3>{creativeBrief.businessName} preview brief</h3>
            <p>{creativeBrief.visualDirection}</p>
          </div>
          <dl>
            <div><dt>Branding source</dt><dd>{creativeBrief.brandingSource}</dd></div>
            <div><dt>Logo</dt><dd>{creativeBrief.logoStatus}</dd></div>
            <div><dt>Color source</dt><dd>{creativeBrief.brandColorSource}</dd></div>
            <div><dt>Imagery source</dt><dd>{creativeBrief.imagerySource}</dd></div>
            <div><dt>Primary service</dt><dd>{creativeBrief.primaryService}</dd></div>
            <div><dt>Audience</dt><dd>{creativeBrief.customerAudience}</dd></div>
            <div><dt>Contact path</dt><dd>{creativeBrief.verifiedEmailOrContactPath}</dd></div>
            <div><dt>Business tone</dt><dd>{creativeBrief.businessTone.replace("-", " ")}</dd></div>
            <div><dt>Customer type</dt><dd>{creativeBrief.likelyCustomerType}</dd></div>
          </dl>
          <p><b>Image intents:</b> {creativeBrief.imageIntents?.join(" ") || "Not recorded"}</p>
        </section>
      )}
      {quality && (
        <section className="engine-preview-quality" id="preview-qa">
          <div>
            <span>Preview quality check</span>
            <h3>{quality.overall}/100 overall</h3>
            <p>Internal design QA for polish, specificity, conversion clarity, mobile readiness, and truthfulness.</p>
          </div>
          <dl>
            <div><dt>Status</dt><dd>{quality.status || "Not scored"}</dd></div>
            <div><dt>Hero impact</dt><dd>{quality.heroImpact ?? "N/A"}</dd></div>
            <div><dt>Image quality</dt><dd>{quality.imageQuality ?? "N/A"}</dd></div>
            <div><dt>Image relevance</dt><dd>{quality.imageSectionRelevance ?? "N/A"}</dd></div>
            <div><dt>Branding</dt><dd>{quality.branding ?? "N/A"}</dd></div>
            <div><dt>Layout variety</dt><dd>{quality.layoutVariety ?? "N/A"}</dd></div>
            <div><dt>Visual polish</dt><dd>{quality.visualPolish}</dd></div>
            <div><dt>Business specificity</dt><dd>{quality.businessSpecificity}</dd></div>
            <div><dt>Clarity</dt><dd>{quality.clarity}</dd></div>
            <div><dt>Mobile responsiveness</dt><dd>{quality.mobileResponsiveness}</dd></div>
            <div><dt>Conversion strength</dt><dd>{quality.conversionStrength}</dd></div>
            <div><dt>Safety/truthfulness</dt><dd>{quality.safetyTruthfulness}</dd></div>
          </dl>
          {quality.notes.length ? <ul>{quality.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
        </section>
      )}
      <section className="engine-preview-art-direction">
        <div>
          <span>Image strategy</span>
          <h3>{imageSet.sourceStatus}</h3>
          <p>{imageSummary.length} images selected across hero, services, gallery, comparison, process, and CTA sections.</p>
        </div>
        <dl>
          <div><dt>Stock provider</dt><dd>{imageSet.providerStatus}</dd></div>
          <div><dt>Distinct images</dt><dd>{new Set(imageSummary.map((image) => image.src)).size}</dd></div>
          <div><dt>Hero image</dt><dd>{imageSet.hero.source}</dd></div>
          <div><dt>Warnings</dt><dd>{imageSet.warnings.length ? imageSet.warnings.join(", ") : "None"}</dd></div>
        </dl>
      </section>
      {preview.regenerationFeedbackHistory?.length ? (
        <section><h3>Feedback history</h3><ul>{preview.regenerationFeedbackHistory.map((item) => <li key={item}>{item}</li>)}</ul></section>
      ) : null}
      <section><h3>Visual style direction</h3><p>{preview.visualStyleDirection || "Use confident typography, practical project photography, and high-contrast estimate actions."}</p></section>
      <section><h3>Homepage structure</h3><ol>{preview.homepageStructure.map((item) => <li key={item}>{item}</li>)}</ol></section>
      <section><h3>Service page structure</h3><ol>{preview.servicePageStructure.map((item) => <li key={item}>{item}</li>)}</ol></section>
      <div className="engine-two-col">
        <section><h3>CTA strategy</h3><p>{preview.ctaStrategy}</p></section>
        <section><h3>Trust strategy</h3><p>{preview.trustStrategy}</p></section>
        <section><h3>Portfolio direction</h3><p>{preview.portfolioDirection}</p></section>
        <section><h3>Lead capture</h3><p>{preview.leadCaptureStrategy}</p></section>
      </div>
        </div>
      </details>
    </div>
  );
}

function ActivityView({ prospect, note, setNote, addNote }: Pick<ProspectDetailProps, "prospect" | "note" | "setNote" | "addNote">) {
  return (
    <div className="engine-stack">
      <form className="engine-note" onSubmit={addNote}>
        <label htmlFor="prospect-note">Add operator note</label>
        <textarea id="prospect-note" onChange={(event) => setNote(event.target.value)} placeholder="Record call details, objections, or next steps." value={note} />
        <button className="engine-button engine-button--primary" type="submit">Add note</button>
      </form>
      {prospect.notes.length > 0 && <section><h3>Notes</h3><ul>{prospect.notes.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
      <section>
        <h3>Activity history</h3>
        <div className="engine-activity">
          {prospect.activities.map((item) => <div key={item.id}><i /><p><b>{item.label}</b><span>{formatDate(item.at)}</span></p></div>)}
        </div>
      </section>
    </div>
  );
}
