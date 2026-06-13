"use client";

import React, { useState, type CSSProperties, type FormEvent } from "react";
import { EmptyState } from "@/components/engine/EngineStates";
import {
  activity,
  previewStyleProfile,
  priorityRationale,
  prospectStatuses,
  scoreLabels,
  type Prospect,
  type ProspectStatus,
  type ScoreKey,
} from "@/lib/prospect-engine";

export type DetailTab = "Analysis" | "Outreach" | "Preview" | "Activity";

type ProspectDetailProps = {
  prospect: Prospect;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  onAnalyze: () => void;
  onOutreach: () => void;
  onPreview: () => void;
  onStatus: (status: ProspectStatus) => void;
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
  onOutreach,
  onPreview,
  onStatus,
  note,
  setNote,
  addNote,
  updateSelected,
}: ProspectDetailProps) {
  return (
    <aside className="engine-detail">
      <header className="engine-detail__hero">
        <div className="engine-detail__identity">
          <span>{prospect.businessName.charAt(0)}</span>
          <div>
            <h2>{prospect.businessName}</h2>
            <p>{prospect.trade}{" \u00b7 "}{prospect.city}, {prospect.state}</p>
            <small>{priorityRationale(prospect)}</small>
          </div>
        </div>
        <ScoreRing value={prospect.priorityScore} />
      </header>
      <div className="engine-detail__meta">
        {prospect.website
          ? <a href={safeWebsiteUrl(prospect.website)} rel="noreferrer" target="_blank">Open website</a>
          : prospect.profileUrl
            ? <a href={safeWebsiteUrl(prospect.profileUrl)} rel="noreferrer" target="_blank">Open public profile</a>
            : <span>No owned website</span>}
        {prospect.phone ? <a href={`tel:${prospect.phone}`}>{prospect.phone}</a> : <span>No public phone</span>}
        {prospect.email ? <a href={`mailto:${prospect.email}`}>{prospect.email}</a> : <span>No public email</span>}
        <select aria-label="Pipeline status" onChange={(event) => onStatus(event.target.value as ProspectStatus)} value={prospect.status}>
          {prospectStatuses.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      <nav className="engine-tabs" aria-label="Prospect detail">
        {(["Analysis", "Outreach", "Preview", "Activity"] as DetailTab[]).map((tab) => (
          <button className={detailTab === tab ? "is-active" : ""} key={tab} onClick={() => setDetailTab(tab)} type="button">
            {tab}
          </button>
        ))}
      </nav>
      <div className="engine-detail__body">
        {detailTab === "Analysis" && (prospect.prospectType === "no_website_social_only"
          ? <PresenceGapView prospect={prospect} />
          : prospect.analysis
          ? <AnalysisView prospect={prospect} onAnalyze={onAnalyze} />
          : <EmptyState title="Website not analyzed yet" body="Run the scoring engine to identify strengths, conversion gaps, and redesign opportunity." action={onAnalyze} actionLabel="Analyze website" />)}
        {detailTab === "Outreach" && (prospect.outreach
          ? <OutreachView prospect={prospect} updateSelected={updateSelected} />
          : <EmptyState title="No outreach draft yet" body={prospect.prospectType === "no_website_social_only" ? "Generate an ownership-focused draft grounded in the public business profile. It will stay unsent until approved." : "Generate a personal draft grounded in the website analysis. It will stay unsent until approved."} action={onOutreach} actionLabel="Generate outreach" />)}
        {detailTab === "Preview" && (prospect.preview
          ? <PreviewView prospect={prospect} />
          : <EmptyState title="No preview concept yet" body="Create a contractor-specific page structure, visual direction, trust strategy, and lead-capture plan." action={onPreview} actionLabel="Generate preview concept" />)}
        {detailTab === "Activity" && <ActivityView prospect={prospect} note={note} setNote={setNote} addNote={addNote} />}
      </div>
    </aside>
  );
}

function PresenceGapView({ prospect }: { prospect: Prospect }) {
  return (
    <div className="engine-stack">
      <section>
        <h3>No Website / Social Only prospect</h3>
        <p>No owned website was found. The opportunity is to give this business a permanent online home instead of relying entirely on Facebook, Instagram, Google, or directory listings.</p>
      </section>
      <div className="engine-score-grid">
        <div><span>Public reviews</span><b>{prospect.reviewCount}</b></div>
        <div><span>Rating</span><b>{prospect.rating || "Not recorded"}</b></div>
        <div><span>Recent reviews</span><b>{prospect.recentReviewCount}</b></div>
        <div><span>Source confidence</span><b>{prospect.sourceConfidence}</b></div>
      </div>
      <section><h3>Recommended pitch</h3><p>Lead with owning the customer journey: a clear services page, local proof, and direct estimate path that the business controls.</p></section>
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

function OutreachView({ prospect, updateSelected }: Pick<ProspectDetailProps, "prospect" | "updateSelected">) {
  const outreach = prospect.outreach!;
  const [complianceConfirmed, setComplianceConfirmed] = useState(false);
  const [copied, setCopied] = useState("");

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
          <p>{outreach.approved ? "This draft has been reviewed. Copy it into your normal email workflow and complete the postal-address placeholder before sending." : "Review facts, tone, recipient details, sender identity, and opt-out handling before approving."}</p>
          {!outreach.approved && (
            <label className="engine-compliance-check">
              <input checked={complianceConfirmed} onChange={(event) => setComplianceConfirmed(event.target.checked)} type="checkbox" />
              <span>I verified the public contact source and truthful content, and I will add the sender postal address and honor opt-out requests before manual sending.</span>
            </label>
          )}
        </div>
        <button className="engine-button engine-button--primary" disabled={!outreach.approved && !complianceConfirmed} onClick={toggleApproval} type="button">
          {outreach.approved ? "Remove approval" : "Approve personal draft"}
        </button>
      </div>
      <section><h3>Subject options</h3><ul>{outreach.subjects.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <DraftSection approved={outreach.approved} copied={copied} label="Concise" onCopy={copyDraft} value={outreach.concise} />
      <DraftSection approved={outreach.approved} copied={copied} label="Detailed" onCopy={copyDraft} value={outreach.detailed} />
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
        <span>{prospect.trade} concept</span>
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
