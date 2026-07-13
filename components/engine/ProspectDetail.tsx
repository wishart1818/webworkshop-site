"use client";

import React, { useState, type CSSProperties, type FormEvent } from "react";
import { EmptyState } from "@/components/engine/EngineStates";
import { explainProspectBucket } from "@/lib/prospect-funnel";
import {
  activity,
  displayStateCode,
  displayTradeCategory,
  previewStyleProfile,
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

export type DetailTab = "Analysis" | "Outreach" | "Preview" | "Activity";

type ProspectDetailProps = {
  prospect: Prospect;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  onAnalyze: () => void;
  onPresenceGap: () => void;
  onOutreach: () => void;
  onRegenerateOutreach: () => Promise<void>;
  onCreateReviewPackage: () => Promise<void>;
  onPreview: () => void;
  onStatus: (status: ProspectStatus) => void;
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

function prospectLocationLine(prospect: Pick<Prospect, "trade" | "city" | "state">) {
  return `${displayTradeCategory(prospect.trade)} · ${titleCaseLocation(prospect.city)}, ${displayStateCode(prospect.state)}`;
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
  onCreateReviewPackage,
  onPreview,
  onStatus,
  onClose,
  note,
  setNote,
  addNote,
  updateSelected,
}: ProspectDetailProps) {
  const presenceGap = prospectHasUnusableWebsite(prospect);
  const presenceLabels = prospectPresenceLabels(prospect);
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
        <span className={`engine-website-state engine-website-state--${prospect.websiteStatus}`}>{websiteAvailabilityLabels[prospect.websiteStatus]}</span>
        <select aria-label="Pipeline status" onChange={(event) => onStatus(event.target.value as ProspectStatus)} value={prospect.status}>
          {prospectStatuses.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {presenceLabels.length > 0 && <div className="engine-prospect-labels" aria-label="Prospect presence labels" role="list">{presenceLabels.map((label) => <span key={label} role="listitem">{label}</span>)}</div>}
      <ContactExplanation prospect={prospect} />
      <nav className="engine-tabs" aria-label="Prospect detail">
        {(["Analysis", "Outreach", "Preview", "Activity"] as DetailTab[]).map((tab) => (
          <button className={detailTab === tab ? "is-active" : ""} key={tab} onClick={() => setDetailTab(tab)} type="button">
            {tab}
          </button>
        ))}
      </nav>
      <div className="engine-detail__body">
        {detailTab === "Analysis" && (presenceGap
          ? <PresenceGapView onAnalyze={onAnalyze} onPresenceGap={onPresenceGap} prospect={prospect} />
          : prospect.analysis
          ? <AnalysisView prospect={prospect} onAnalyze={onAnalyze} />
          : <UnanalyzedWebsiteView onAnalyze={onAnalyze} onPresenceGap={onPresenceGap} />)}
        {detailTab === "Outreach" && (prospect.outreach
          ? <OutreachView prospect={prospect} updateSelected={updateSelected} onRegenerateOutreach={onRegenerateOutreach} onCreateReviewPackage={onCreateReviewPackage} />
          : <EmptyState title="No outreach draft yet" body={prospect.prospectType === "no_website_social_only" ? "Generate an ownership-focused draft grounded in the public business profile. It will stay unsent until approved." : "Generate a personal draft grounded in the website analysis. It will stay unsent until approved."} action={onOutreach} actionLabel="Generate outreach" />)}
        {detailTab === "Preview" && (prospect.preview
          ? <PreviewView prospect={prospect} />
          : <EmptyState title="No preview concept yet" body="Create a contractor-specific page structure, visual direction, trust strategy, and lead-capture plan." action={onPreview} actionLabel="Generate preview concept" />)}
        {detailTab === "Activity" && <ActivityView prospect={prospect} note={note} setNote={setNote} addNote={addNote} />}
      </div>
    </aside>
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

function PreviewView({ prospect }: { prospect: Prospect }) {
  const preview = prospect.preview!;
  const styleProfile = previewStyleProfile(prospect, preview);
  const quality = preview.qualityScore;
  const palette = [
    ["Primary", styleProfile.primaryColor],
    ["Accent", styleProfile.accentColor],
    ["Surface", styleProfile.surfaceColor],
    ["Soft surface", styleProfile.softSurfaceColor],
    ["Text", styleProfile.inkColor],
  ];
  return (
    <div className="engine-stack">
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
        </dl>
      </section>
      {quality && (
        <section className="engine-preview-quality">
          <div>
            <span>Preview quality check</span>
            <h3>{quality.overall}/100 overall</h3>
            <p>Internal design QA for polish, specificity, conversion clarity, mobile readiness, and truthfulness.</p>
          </div>
          <dl>
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
