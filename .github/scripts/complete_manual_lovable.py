from __future__ import annotations

from pathlib import Path
from textwrap import dedent, indent
import re


def replace_required(content: str, old: str, new: str, label: str) -> str:
    if new in content:
        return content
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} target, found {count}: {old[:120]!r}")
    return content.replace(old, new, 1)


def ensure_wording(content: str, old: str, new: str, label: str) -> str:
    if new in content:
        return content
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Could not establish {label}; old={count}, new=0")
    return content.replace(old, new, 1)


# Recovery is now based on the saved outreach artifact, not a prebuilt preview.
test_path = Path("tests/top-prospects.test.ts")
tests = test_path.read_text(encoding="utf-8")
tests = replace_required(
    tests,
    '  assert.equal(recoverableTopProspect({ ...prospect, preview: undefined }, jobCreatedAt), false);',
    '  assert.equal(recoverableTopProspect({ ...prospect, preview: undefined }, jobCreatedAt), true);',
    "preview-independent recovery test",
)
test_path.write_text(tests, encoding="utf-8")

workspace_path = Path("components/engine/AutonomousGrowthWorkspace.tsx")
workspace = workspace_path.read_text(encoding="utf-8")
workspace = replace_required(
    workspace,
    '  const [copied, setCopied] = useState("");\n  const [sendingQueueItemId, setSendingQueueItemId] = useState("");\n  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);',
    '  const [copied, setCopied] = useState("");\n  const [approvingQueueItemId, setApprovingQueueItemId] = useState("");\n  const [sendingQueueItemId, setSendingQueueItemId] = useState("");\n  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);',
    "approval progress state",
)

if "setApprovingQueueItemId(item.id);" not in workspace:
    approval_pattern = r'  async function approveAndQueueEmail\(item: OutreachQueueItem\) \{[\s\S]*?\n  \}\n\n  async function copyText'
    approval_replacement = indent(dedent('''
    async function approveAndQueueEmail(item: OutreachQueueItem) {
      setApprovingQueueItemId(item.id);
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/engine/autonomous-growth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve_and_queue_email",
            queueItemId: item.id,
            expectedApprovalSnapshot: {
              businessName: item.businessName,
              email: item.email,
              subjectLine: item.subjectLine,
              emailBody: item.emailBody,
              outreachCopyVersion: item.outreachCopyVersion,
              updatedAt: item.updatedAt,
            },
          }),
        });
        const payload = await response.json() as ApiPayload;
        if (!response.ok || !payload.item || !payload.approval) throw new Error(apiError(payload, "Unable to approve and queue email."));
        const approvedItem = payload.item;
        const approval = payload.approval;
        if (approval.queued) {
          setDashboard((current) => current ? {
            ...current,
            queue: current.queue.map((entry) => entry.id === approvedItem.id ? approvedItem : entry),
          } : current);
        }
        setNotice(approval.queued
          ? `Email approved and queued for ${approvedItem.businessName}. It has not been sent yet.`
          : `Email was not queued: ${approval.blockedReasons.join("; ")}`);
        await loadDashboard();
      } catch (approvalError) {
        setError(approvalError instanceof Error ? approvalError.message : "Unable to approve and queue email.");
      } finally {
        setApprovingQueueItemId("");
        setSaving(false);
      }
    }

    async function copyText
    ''').strip("\n"), "  ")
    workspace, count = re.subn(approval_pattern, approval_replacement, workspace, count=1)
    if count != 1:
        raise SystemExit(f"Expected one approval handler, found {count}.")

if "approvingItemId={approvingQueueItemId}" not in workspace:
    workspace, count = re.subn(
        r'(<QueueSection\n)(\s+)(copied=\{copied\})',
        r'\1\2approvingItemId={approvingQueueItemId}\n\2\3',
        workspace,
    )
    if count != 3:
        raise SystemExit(f"Expected three QueueSection calls, found {count}.")

if "function QueueSection({\n  approvingItemId," not in workspace:
    workspace, count = re.subn(
        r'(function QueueSection\(\{\n)(  copied,)',
        r'\1  approvingItemId,\n\2',
        workspace,
        count=1,
    )
    if count != 1:
        raise SystemExit("QueueSection parameter insertion failed.")
if "approvingItemId: string;" not in workspace:
    workspace, count = re.subn(
        r'(function QueueSection\([\s\S]*?\}: \{\n)(  copied: string;)',
        r'\1  approvingItemId: string;\n\2',
        workspace,
        count=1,
    )
    if count != 1:
        raise SystemExit("QueueSection type insertion failed.")
if "approving={approvingItemId === item.id}" not in workspace:
    workspace, count = re.subn(
        r'(<QueueItemRow\n)(\s+)(copied=\{copied\})',
        r'\1\2approving={approvingItemId === item.id}\n\2\3',
        workspace,
        count=1,
    )
    if count != 1:
        raise SystemExit("QueueItemRow approval prop insertion failed.")
if "function QueueItemRow({\n  approving," not in workspace:
    workspace, count = re.subn(
        r'(function QueueItemRow\(\{\n)(  copied,)',
        r'\1  approving,\n\2',
        workspace,
        count=1,
    )
    if count != 1:
        raise SystemExit("QueueItemRow parameter insertion failed.")
if "approving: boolean;" not in workspace:
    workspace, count = re.subn(
        r'(function QueueItemRow\([\s\S]*?\}: \{\n)(  copied: string;)',
        r'\1  approving: boolean;\n\2',
        workspace,
        count=1,
    )
    if count != 1:
        raise SystemExit("QueueItemRow type insertion failed.")

workspace = replace_required(
    workspace,
    '  const displayStatus = sending\n    ? "Sending"\n    : item.status ===',
    '  const displayStatus = approving\n    ? "Approving"\n    : sending\n      ? "Sending"\n      : item.status ===',
    "approval display status",
)
workspace = replace_required(
    workspace,
    '      <div><i className={`engine-package-state engine-package-state--${item.status.toLowerCase().replaceAll(" ", "-")}`}>{displayStatus}</i><span>{item.status === "Queued" ? "Approved / Queued" : item.status === "Sending" ? "Provider dispatch in progress" : item.subjectLine}</span></div>',
    '      <div><i className={`engine-package-state engine-package-state--${item.status.toLowerCase().replaceAll(" ", "-")}`}>{displayStatus}</i><span>{approving ? "Validating the exact draft and safety gates" : item.status === "Queued" ? "Approved / Queued" : item.status === "Sending" ? "Provider dispatch in progress" : item.subjectLine}</span></div>',
    "approval row detail",
)

if 'aria-busy={approving}' not in workspace:
    approval_button_pattern = r'\{\["Eligible", "Needs Review"\]\.includes\(item\.status\)\s*\? <button className="engine-button engine-button--primary" onClick=\{\(\) => void onApproveEmail\(item\)\} type="button">Approve &amp; Queue Email</button>\s*: null\}'
    approval_button = '{["Eligible", "Needs Review"].includes(item.status)\n          ? <button aria-busy={approving} className="engine-button engine-button--primary" disabled={approving} onClick={() => void onApproveEmail(item)} type="button">{approving ? "Approving..." : "Approve & Queue Email"}</button>\n          : null}'
    workspace, count = re.subn(approval_button_pattern, approval_button, workspace, count=1)
    if count != 1:
        raise SystemExit("Approval button feedback replacement failed.")

wording = [
    (
        '  if (mode === "dry_run") return "Finds, scores, generates previews and copy, then sends nothing.";',
        '  if (mode === "dry_run") return "Finds, scores, and drafts permission-first outreach, then sends nothing.";',
        "dry-run description",
    ),
    (
        'Eligible batches still send only Queued public-email leads that pass suppression, cooldown, daily cap, public preview, opt-out, postal address, and audit gates.',
        'Eligible batches still send only Queued public-email leads that pass suppression, cooldown, daily cap, truthful first-touch, opt-out, postal address, and audit gates.',
        "pilot safety wording",
    ),
    (
        'description="Leads blocked by contact rules, preview quality, unsupported claims, opt-out, or bad fit logic."',
        'description="Leads blocked by contact rules, unsupported claims, opt-out, stale evidence, or bad fit logic."',
        "blocked queue wording",
    ),
    (
        '<div><dt>Needs preview</dt><dd>{existing.needsPreview}</dd></div>',
        '<div><dt>Post-interest preview work</dt><dd>{existing.needsPreview}</dd></div>',
        "preview metric wording",
    ),
    (
        '<label>Max previews/run<input min="0" name="maxPreviewsPerRun"',
        '<label>Legacy/post-interest preview cap<input min="0" name="maxPreviewsPerRun"',
        "preview cap wording",
    ),
    (
        'type="checkbox" />Require preview QA 85+</label>',
        'type="checkbox" />Require preview QA 85+ before a manual Loom</label>',
        "preview QA wording",
    ),
]
for old, new, label in wording:
    workspace = ensure_wording(workspace, old, new, label)

workspace_path.write_text(workspace, encoding="utf-8")

Path("tests/approval-feedback.test.ts").write_text(dedent('''
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("queue approval shows row-specific progress and optimistic confirmation", () => {
  const source = readFileSync("components/engine/AutonomousGrowthWorkspace.tsx", "utf8");
  assert.match(source, /approvingQueueItemId/);
  assert.match(source, /aria-busy=\{approving\}/);
  assert.match(source, /Approving\.\.\./);
  assert.match(source, /Validating the exact draft and safety gates/);
  assert.match(source, /queue: current\.queue\.map/);
  assert.match(source, /It has not been sent yet/);
});
''').lstrip(), encoding="utf-8")

print("Idempotent manual Lovable completion pass applied.")
