"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type EmailQueueItem = {
  id: string;
  businessName: string;
  email: string;
  subjectLine: string;
  emailBody: string;
  status: string;
  contactSource: string;
  reviewSummary?: string;
  detectedIssues?: string[];
  outreachCopyVersion: string;
  updatedAt: string;
};

type DashboardPayload = {
  queue?: EmailQueueItem[];
  error?: string;
};

function greetingFirstName(item: EmailQueueItem) {
  const match = item.emailBody.match(/^Hi ([^,\n]+),/);
  const value = match?.[1]?.trim() ?? "";
  return value && value.toLowerCase() !== "there" ? value : "";
}

const injectedButtonAttribute = "data-email-draft-review-button";

function normalizedButtonText(button: HTMLButtonElement) {
  return button.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function findRowButton(row: HTMLElement, label: string) {
  return Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => normalizedButtonText(button) === label,
  );
}

function findQueueItemForRow(row: HTMLElement, items: EmailQueueItem[]) {
  const rowText = row.textContent ?? "";
  return (
    items.find((item) => item.email && rowText.includes(item.email)) ??
    items.find((item) => item.businessName && rowText.includes(item.businessName))
  );
}

export function EmailDraftReviewHelper() {
  const pathname = usePathname();
  const [items, setItems] = useState<EmailQueueItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<EmailQueueItem | null>(null);
  const [loadError, setLoadError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [approving, setApproving] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [contactFirstName, setContactFirstName] = useState("");
  const [savingContactName, setSavingContactName] = useState(false);
  const [contactNameMessage, setContactNameMessage] = useState("");

  const loadQueue = useCallback(async () => {
    if (pathname !== "/engine") return;

    try {
      const response = await fetch("/api/engine/autonomous-growth", { cache: "no-store" });
      const payload = (await response.json()) as DashboardPayload;
      if (!response.ok || !payload.queue) {
        throw new Error(payload.error || "Unable to load saved email drafts.");
      }
      setItems(payload.queue);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load saved email drafts.");
    }
  }, [pathname]);

  const closeDialog = useCallback(() => {
    if (approving) return;
    setSelectedItem(null);
    setApprovalError("");
    setCopyState("idle");
    setContactFirstName("");
    setContactNameMessage("");
  }, [approving]);

  useEffect(() => {
    if (pathname !== "/engine") return;
    void loadQueue();
    const refreshTimer = window.setInterval(() => void loadQueue(), 30_000);
    return () => window.clearInterval(refreshTimer);
  }, [loadQueue, pathname]);

  useEffect(() => {
    if (pathname !== "/engine") return;

    function injectButtons() {
      const rows = document.querySelectorAll<HTMLElement>(
        ".engine-autonomous-table article[role='row']",
      );

      rows.forEach((row) => {
        if (row.querySelector(`[${injectedButtonAttribute}]`)) return;

        const item = findQueueItemForRow(row, items);
        const actions = row.querySelector<HTMLElement>(".engine-result-actions");
        if (!item || !actions || !item.email) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "engine-button engine-button--email-review";
        button.textContent = "View Email Draft";
        button.setAttribute(injectedButtonAttribute, "true");
        button.addEventListener("click", () => {
          setSelectedItem(structuredClone(item));
          setApprovalError("");
          setCopyState("idle");
          setContactFirstName(greetingFirstName(item));
          setContactNameMessage("");
        });

        const approveButton = findRowButton(row, "Approve & Queue Email");
        if (approveButton) {
          actions.insertBefore(button, approveButton);
        } else {
          actions.prepend(button);
        }
      });
    }

    injectButtons();
    const observer = new MutationObserver(injectButtons);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document
        .querySelectorAll<HTMLElement>(`[${injectedButtonAttribute}]`)
        .forEach((button) => button.remove());
    };
  }, [items, loadQueue, pathname]);

  useEffect(() => {
    if (!selectedItem) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDialog();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, selectedItem]);

  if (pathname !== "/engine") return null;

  const canApprove = Boolean(
    selectedItem?.email
      && selectedItem?.subjectLine.trim()
      && selectedItem?.emailBody.trim()
      && selectedItem?.updatedAt
      && selectedItem?.outreachCopyVersion
      && ["Eligible", "Needs Review"].includes(selectedItem.status)
      && !approving
      && !savingContactName,
  );

  async function copyDraft() {
    if (!selectedItem) return;
    const fullDraft = [
      `To: ${selectedItem.email}`,
      `Subject: ${selectedItem.subjectLine}`,
      "",
      selectedItem.emailBody,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(fullDraft);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }


  async function saveVerifiedContactFirstName() {
    if (!selectedItem || savingContactName) return;
    const value = contactFirstName.trim();
    if (!value) {
      setApprovalError("Enter a verified person's first name.");
      return;
    }

    setSavingContactName(true);
    setApprovalError("");
    setContactNameMessage("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_verified_contact_first_name",
          queueItemId: selectedItem.id,
          contactFirstName: value,
          expectedUpdatedAt: selectedItem.updatedAt,
        }),
      });
      const payload = await response.json() as {
        item?: EmailQueueItem;
        contactFirstName?: string;
        error?: string;
      };
      if (!response.ok || !payload.item || !payload.contactFirstName) {
        throw new Error(payload.error || "Unable to save the verified contact name.");
      }
      const updatedItem = payload.item;
      setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item));
      setSelectedItem(updatedItem);
      setContactFirstName(payload.contactFirstName);
      setContactNameMessage(`Saved ${payload.contactFirstName} and regenerated this editable draft. Nothing was sent.`);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Unable to save the verified contact name.");
    } finally {
      setSavingContactName(false);
    }
  }

  async function approveFromDialog() {
    if (!selectedItem || !canApprove) return;
    setApproving(true);
    setApprovalError("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_and_queue_email",
          queueItemId: selectedItem.id,
          expectedApprovalSnapshot: {
            businessName: selectedItem.businessName,
            email: selectedItem.email,
            subjectLine: selectedItem.subjectLine,
            emailBody: selectedItem.emailBody,
            outreachCopyVersion: selectedItem.outreachCopyVersion,
            updatedAt: selectedItem.updatedAt,
          },
        }),
      });
      const payload = await response.json() as { approval?: { queued: boolean; blockedReasons: string[] }; error?: string };
      if (!response.ok || !payload.approval?.queued) {
        throw new Error(payload.error || payload.approval?.blockedReasons.join("; ") || "Unable to approve this exact draft.");
      }
      await loadQueue();
      window.location.reload();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Unable to approve this exact draft.");
    } finally {
      setApproving(false);
    }
  }

  return (
    <>
      {selectedItem ? (
        <div
          aria-label="Email draft review"
          className="email-draft-review-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDialog();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="email-draft-review-title"
            aria-modal="true"
            className="email-draft-review-dialog"
            role="dialog"
          >
            <header className="email-draft-review-header">
              <div>
                <span>Exact saved outbound message</span>
                <h2 id="email-draft-review-title">Review Email Draft</h2>
                <p>
                  Check the recipient, subject, and full body before this prospect enters the send queue.
                </p>
              </div>
              <button
                aria-label="Close email draft"
                className="email-draft-review-close"
                onClick={closeDialog}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="email-draft-review-fields">
              <div>
                <span>Business</span>
                <strong>{selectedItem.businessName}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{selectedItem.status}</strong>
              </div>
              <div className="email-draft-review-wide">
                <span>To</span>
                <strong>{selectedItem.email || "No public email saved"}</strong>
              </div>
              <div className="email-draft-review-wide">
                <span>Subject</span>
                <strong>{selectedItem.subjectLine || "No subject saved"}</strong>
              </div>
            </div>


            <div className="email-draft-review-contact-name">
              <label htmlFor="verified-contact-first-name">Verified contact first name</label>
              <div>
                <input
                  autoComplete="off"
                  id="verified-contact-first-name"
                  maxLength={40}
                  onChange={(event) => setContactFirstName(event.target.value)}
                  placeholder="Nick"
                  type="text"
                  value={contactFirstName}
                />
                <button
                  className="engine-button"
                  disabled={savingContactName || !contactFirstName.trim()}
                  onClick={() => void saveVerifiedContactFirstName()}
                  type="button"
                >
                  {savingContactName ? "Saving..." : "Save & Regenerate Greeting"}
                </button>
              </div>
              <p>Use only a name you verified from a public business source. The app will not infer a name from the email address.</p>
              {contactNameMessage ? <strong>{contactNameMessage}</strong> : null}
            </div>

            <div className="email-draft-review-body">
              <span>Email body</span>
              <pre>{selectedItem.emailBody || "No email body is currently saved for this prospect."}</pre>
            </div>

            {(selectedItem.reviewSummary || selectedItem.detectedIssues?.length) ? (
              <div className="email-draft-review-notes">
                {selectedItem.reviewSummary ? <p><b>Review:</b> {selectedItem.reviewSummary}</p> : null}
                {selectedItem.detectedIssues?.length ? (
                  <p><b>Detected issues:</b> {selectedItem.detectedIssues.join("; ")}</p>
                ) : null}
              </div>
            ) : null}

            {loadError ? <p className="email-draft-review-error">Latest refresh warning: {loadError}</p> : null}
            {approvalError ? <p className="email-draft-review-error">Approval blocked: {approvalError}</p> : null}

            <footer className="email-draft-review-actions">
              <button className="engine-button" onClick={closeDialog} type="button">
                Close
              </button>
              <button className="engine-button" onClick={() => void copyDraft()} type="button">
                {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy Email"}
              </button>
              <button
                className="engine-button engine-button--primary"
                disabled={!canApprove}
                onClick={() => void approveFromDialog()}
                title={canApprove ? "Approve this exact saved draft and version" : "A complete current draft in an approvable status is required"}
                type="button"
              >
                {approving ? "Approving exact draft..." : "Approve & Queue Email"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <style jsx global>{`
        .engine-button--email-review {
          border-color: #0f766e !important;
          background: #ecfdf5 !important;
          color: #065f46 !important;
          font-weight: 800 !important;
        }

        .email-draft-review-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(4, 12, 9, 0.72);
          backdrop-filter: blur(4px);
        }

        .email-draft-review-dialog {
          width: min(760px, 100%);
          max-height: min(860px, calc(100vh - 48px));
          overflow: auto;
          border: 1px solid #9fb9ae;
          border-radius: 18px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
          color: #10251e;
        }

        .email-draft-review-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          padding: 24px 26px 18px;
          border-bottom: 1px solid #d8e4df;
          background: #f3faf7;
        }

        .email-draft-review-header span,
        .email-draft-review-fields span,
        .email-draft-review-body > span {
          display: block;
          margin-bottom: 5px;
          color: #4f6d62;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .email-draft-review-header h2 {
          margin: 0;
          font-size: clamp(1.35rem, 3vw, 1.8rem);
        }

        .email-draft-review-header p {
          margin: 8px 0 0;
          color: #4b6259;
          line-height: 1.5;
        }

        .email-draft-review-close {
          display: grid;
          flex: 0 0 40px;
          width: 40px;
          height: 40px;
          place-items: center;
          border: 1px solid #b8cbc3;
          border-radius: 999px;
          background: #ffffff;
          color: #173d31;
          cursor: pointer;
          font-size: 1.65rem;
          line-height: 1;
        }

        .email-draft-review-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 22px 26px 0;
        }

        .email-draft-review-fields > div {
          min-width: 0;
          padding: 13px 15px;
          border: 1px solid #d6e2dd;
          border-radius: 12px;
          background: #fbfdfc;
        }

        .email-draft-review-fields strong {
          display: block;
          overflow-wrap: anywhere;
          line-height: 1.45;
        }

        .email-draft-review-wide {
          grid-column: 1 / -1;
        }


        .email-draft-review-contact-name {
          margin: 18px 26px 0;
          padding: 15px;
          border: 1px solid #c8d9d2;
          border-radius: 12px;
          background: #f8fcfa;
        }

        .email-draft-review-contact-name label {
          display: block;
          margin-bottom: 8px;
          color: #294c40;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .email-draft-review-contact-name > div {
          display: flex;
          gap: 10px;
        }

        .email-draft-review-contact-name input {
          min-width: 0;
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #a9c0b7;
          border-radius: 9px;
          background: #ffffff;
          color: #14271f;
          font: inherit;
        }

        .email-draft-review-contact-name p,
        .email-draft-review-contact-name strong {
          display: block;
          margin: 8px 0 0;
          color: #4b6259;
          font-size: 0.82rem;
          line-height: 1.45;
        }

        .email-draft-review-contact-name strong {
          color: #17603f;
        }

        .email-draft-review-body {
          padding: 18px 26px 0;
        }

        .email-draft-review-body pre {
          min-height: 190px;
          margin: 0;
          padding: 20px;
          overflow: auto;
          border: 1px solid #bdcec7;
          border-radius: 12px;
          background: #f7faf8;
          color: #14271f;
          font: inherit;
          line-height: 1.65;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .email-draft-review-notes,
        .email-draft-review-error {
          margin: 16px 26px 0;
          padding: 13px 15px;
          border-radius: 10px;
          background: #fff8e7;
          color: #624a14;
          line-height: 1.5;
        }

        .email-draft-review-notes p {
          margin: 0;
        }

        .email-draft-review-notes p + p {
          margin-top: 7px;
        }

        .email-draft-review-error {
          background: #fff0ee;
          color: #8a2f23;
        }

        .email-draft-review-actions {
          position: sticky;
          bottom: 0;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
          padding: 18px 26px 24px;
          border-top: 1px solid #d8e4df;
          background: rgba(255, 255, 255, 0.97);
        }

        @media (max-width: 640px) {
          .email-draft-review-overlay {
            padding: 10px;
          }

          .email-draft-review-dialog {
            max-height: calc(100vh - 20px);
            border-radius: 14px;
          }

          .email-draft-review-contact-name > div {
            align-items: stretch;
            flex-direction: column;
          }

          .email-draft-review-header,
          .email-draft-review-actions {
            padding-left: 18px;
            padding-right: 18px;
          }

          .email-draft-review-fields,
          .email-draft-review-body {
            padding-left: 18px;
            padding-right: 18px;
          }

          .email-draft-review-fields {
            grid-template-columns: 1fr;
          }

          .email-draft-review-wide {
            grid-column: auto;
          }

          .email-draft-review-actions {
            flex-direction: column-reverse;
          }

          .email-draft-review-actions .engine-button {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
