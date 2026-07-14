"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { OperatorCommandNavigation, OperatorCommandPreview, OperatorCommandReceipt } from "@/lib/operator-command-center";

type CommandMode = "auto" | "search" | "command";

type CommandResponse = {
  preview?: OperatorCommandPreview;
  receipt?: OperatorCommandReceipt;
  receipts?: OperatorCommandReceipt[];
  error?: string;
};

function apiError(payload: { error?: string }, fallback: string) {
  return payload.error || fallback;
}

function displayStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function OperatorCommandBar({
  onNavigate,
  onReceiptsChanged,
}: {
  onNavigate: (navigation: OperatorCommandNavigation) => void;
  onReceiptsChanged?: () => void;
}) {
  const [commandText, setCommandText] = useState("");
  const [mode, setMode] = useState<CommandMode>("auto");
  const [preview, setPreview] = useState<OperatorCommandPreview | null>(null);
  const [receipt, setReceipt] = useState<OperatorCommandReceipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const savedState = window.localStorage.getItem("webworkshop-command-center-expanded");
    setMobileExpanded(savedState === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("webworkshop-command-center-expanded", String(mobileExpanded));
  }, [mobileExpanded]);

  async function post(action: "preview" | "execute" | "confirm") {
    if (!commandText.trim()) return;
    setBusy(true);
    setError("");
    setMobileExpanded(true);
    try {
      const response = await fetch("/api/engine/operator-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          commandText,
          mode: mode === "auto" ? undefined : mode,
        }),
      });
      const payload = (await response.json()) as CommandResponse;
      if (!response.ok) throw new Error(apiError(payload, "Command failed safely."));
      if (payload.preview) setPreview(payload.preview);
      if (payload.receipt) {
        setReceipt(payload.receipt);
        onReceiptsChanged?.();
      }
      const nextPreview = payload.preview;
      const navigation = nextPreview?.navigation;
      if (navigation && (!nextPreview.confirmationRequired || payload.receipt?.status === "completed")) onNavigate(navigation);
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "Command failed safely.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void post("execute");
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setError("Copy failed. Select the text and copy it manually.");
    }
  }

  const helpExamples = [
    "American Dream Pressure Clean",
    "Show me email-ready leads.",
    "Why is sending blocked?",
    "Run the full readiness test.",
    "Pause all outreach.",
    "COMMAND: RUN_FULL_READINESS_TEST\nACTION: EXECUTE",
    "COMMAND: CONFIGURE_AUTO_EMAIL_PILOT\nDAILY_EMAIL_CAP: 1\nFULL_AUTO: false\nACTION: PREVIEW_ONLY",
  ];

  return (
    <section className={`engine-command-center ${mobileExpanded ? "is-mobile-expanded" : ""}`} aria-label="WebWorkshop Operator Command Bar">
      <div className="engine-command-center__summary">
        <button aria-expanded={mobileExpanded} onClick={() => setMobileExpanded((current) => !current)} type="button">
          <span>Search or run a command</span>
          <small>{commandText.trim() ? "Draft ready" : "Collapsed"}</small>
        </button>
      </div>
      <div className="engine-command-center__body">
      <form className="engine-command-bar" onSubmit={submit}>
        <label>
          <span className="sr-only">Search prospects or paste a WebWorkshop command</span>
          <textarea
            onChange={(event) => {
              setCommandText(event.target.value);
              setPreview(null);
              setReceipt(null);
            }}
            placeholder="Search prospects or paste a WebWorkshop command..."
            rows={commandText.includes("\n") ? 4 : 1}
            value={commandText}
          />
        </label>
        <select aria-label="Command bar mode" onChange={(event) => setMode(event.target.value as CommandMode)} value={mode}>
          <option value="auto">Auto detect</option>
          <option value="search">Search</option>
          <option value="command">Command</option>
        </select>
        <button className="engine-button engine-button--primary" disabled={busy || !commandText.trim()} type="submit">{busy ? "Working" : "Run"}</button>
        <button className="engine-button" onClick={() => void post("preview")} disabled={busy || !commandText.trim()} type="button">Preview</button>
        <button className="engine-button" onClick={() => setShowHelp((current) => !current)} type="button">Help</button>
        <button className="engine-button" onClick={() => onNavigate({ tab: "Command Activity" })} type="button">History</button>
      </form>

      {error ? <div className="engine-command-error" role="alert">{error}</div> : null}

      {showHelp ? (
        <div className="engine-command-help">
          <div>
            <b>Search</b>
            <p>Plain business names and market phrases search prospects.</p>
          </div>
          <div>
            <b>Commands</b>
            <p>Questions starting with show, run, why, set, pause, or open are parsed as safe operator commands.</p>
          </div>
          <div>
            <b>Structured</b>
            <p><code>COMMAND:</code> blocks are strict. Unknown fields are rejected instead of guessed.</p>
          </div>
          <div className="engine-command-examples">
            {helpExamples.map((example) => (
              <button className="engine-button" key={example} onClick={() => { setCommandText(example); setMode(example.startsWith("COMMAND:") ? "command" : "auto"); }} type="button">
                {example.split("\n")[0]}
              </button>
            ))}
          </div>
          <button className="engine-button" onClick={() => void copyText("Command examples", helpExamples.join("\n\n"))} type="button">{copied === "Command examples" ? "Copied" : "Copy examples"}</button>
        </div>
      ) : null}

      {preview ? (
        <div className={`engine-command-preview engine-command-preview--level-${preview.confirmationLevel}`}>
          <div className="engine-command-preview__head">
            <div>
              <span>Command understood</span>
              <h2>{preview.commandType}</h2>
              <p>Mode: {mode === "auto" ? "auto detected" : mode}. Confidence: {preview.confidence}.</p>
            </div>
            <strong>Level {preview.confirmationLevel}</strong>
          </div>
          {preview.validationErrors.length ? (
            <div className="engine-command-error" role="alert">
              {preview.validationErrors.map((item) => <p key={item}>{item}</p>)}
            </div>
          ) : null}
          <div className="engine-command-preview__grid">
            <article><b>Planned actions</b><ul>{preview.plannedActions.map((item) => <li key={item}>{item}</li>)}</ul></article>
            <article><b>Safety</b><ul>{preview.safetyImpact.map((item) => <li key={item}>{item}</li>)}</ul></article>
          </div>
          <div className="engine-command-actions">
            {preview.confirmationRequired && !preview.validationErrors.length ? (
              <button className="engine-button engine-button--primary" disabled={busy} onClick={() => void post("confirm")} type="button">Confirm and Apply</button>
            ) : null}
            <button className="engine-button" onClick={() => void copyText("Command plan", preview.copyPlan)} type="button">{copied === "Command plan" ? "Copied" : "Copy plan"}</button>
            <button className="engine-button" onClick={() => { setPreview(null); setReceipt(null); }} type="button">Cancel</button>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <div className={`engine-command-receipt engine-command-receipt--${receipt.status}`} role="status">
          <div>
            <b>Command {displayStatus(receipt.status)}</b>
            <p>{receipt.nextRecommendedAction}</p>
          </div>
          <button className="engine-button" onClick={() => void copyText("Command result", receipt.copyForChatGPT)} type="button">{copied === "Command result" ? "Copied" : "Copy Result for ChatGPT"}</button>
        </div>
      ) : null}
      </div>
    </section>
  );
}

export function CommandActivityWorkspace() {
  const [receipts, setReceipts] = useState<OperatorCommandReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/engine/operator-commands", { cache: "no-store" });
      const payload = (await response.json()) as CommandResponse;
      if (!response.ok || !payload.receipts) throw new Error(apiError(payload, "Unable to load command activity."));
      setReceipts(payload.receipts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load command activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  async function copyText(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1600);
  }

  return (
    <div className="engine-content engine-command-activity">
      <section className="engine-panel">
        <div className="engine-panel__head">
          <div>
            <h2>Command Activity</h2>
            <p>Persistent, secret-safe receipts for operator commands. Receipts never include API keys, passwords, or raw environment values.</p>
          </div>
          <button className="engine-button" onClick={() => void loadReceipts()} type="button">{loading ? "Refreshing" : "Refresh Activity"}</button>
        </div>
        {error ? <div className="engine-error-banner" role="alert"><div><b>Command Activity needs attention</b><p>{error}</p></div></div> : null}
        {!loading && receipts.length === 0 ? <p>No command activity yet. Use the command bar to run a safe search, diagnostic, or settings preview.</p> : null}
        <div className="engine-command-timeline">
          {receipts.map((receipt) => (
            <article className={`engine-command-timeline__item engine-command-timeline__item--${receipt.status}`} key={receipt.id}>
              <header>
                <div>
                  <span>{new Date(receipt.completedAt ?? receipt.createdAt).toLocaleString()}</span>
                  <h3>{receipt.commandType}</h3>
                  <p>{receipt.commandText}</p>
                </div>
                <strong>{displayStatus(receipt.status)}</strong>
              </header>
              <div className="engine-command-preview__grid">
                <div><b>What changed</b><ul>{receipt.whatChanged.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><b>What did not change</b><ul>{receipt.whatDidNotChange.map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
              <dl>
                <div><dt>Records affected</dt><dd>{receipt.recordsAffected}</dd></div>
                <div><dt>Tests triggered</dt><dd>{receipt.testsTriggered.join(", ") || "None"}</dd></div>
                <div><dt>Messages sent</dt><dd>{receipt.messagesSent}</dd></div>
                <div><dt>Outreach sent</dt><dd>{receipt.outreachSent.emails} emails, {receipt.outreachSent.dms} DMs, {receipt.outreachSent.forms} forms, {receipt.outreachSent.calls} calls, {receipt.outreachSent.looms} Looms</dd></div>
              </dl>
              {receipt.safeErrorMessage ? <p className="engine-command-error"><b>Safe error:</b> {receipt.safeErrorMessage}</p> : null}
              <p><b>Next:</b> {receipt.nextRecommendedAction}</p>
              <div className="engine-command-actions">
                <button className="engine-button" onClick={() => void copyText(`chatgpt-${receipt.id}`, receipt.copyForChatGPT)} type="button">{copied === `chatgpt-${receipt.id}` ? "Copied" : "Copy Result for ChatGPT"}</button>
                <button className="engine-button" onClick={() => void copyText(`technical-${receipt.id}`, receipt.technicalSummary)} type="button">Copy Technical Result</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
