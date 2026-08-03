from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}\n--- expected ---\n{old}")
    file.write_text(text.replace(old, new, 1))


# Repository action: save only a safe verified first name, preserve protected states,
# and regenerate only the linked editable draft.
replace_once(
    "lib/autonomous-growth-repository.ts",
    'import { discoveryProviderCoverageStatus } from "@/lib/lead-discovery";\n',
    'import { discoveryProviderCoverageStatus } from "@/lib/lead-discovery";\nimport { webworkshopRecipientFirstName } from "@/lib/outreach-style-guide";\n',
)

contact_name_function = r'''
export async function saveVerifiedContactFirstNameAndRegenerate(
  id: string,
  value: string,
  expectedUpdatedAt = "",
) {
  const verifiedFirstName = webworkshopRecipientFirstName(value);
  if (!verifiedFirstName) {
    throw new Error("Enter a verified person's first name. Generic labels and email addresses are not allowed.");
  }

  const queueItem = (await listOutreachQueueItems()).find((entry) => entry.id === id) ?? null;
  if (!queueItem) return null;
  if (expectedUpdatedAt && queueItem.updatedAt !== expectedUpdatedAt) {
    throw new Error("The draft changed after it was opened. Refresh and review the current draft before saving the name.");
  }
  if (queueItemDraftMutationIsProtected(queueItem)) {
    throw new Error("The contact name cannot change after approval, sending, contact, or suppression.");
  }
  if (!queueItem.prospectId) {
    throw new Error("This outreach package is not linked to a saved prospect.");
  }

  const prospect = await getProspect(queueItem.prospectId);
  if (!prospect) throw new Error("The linked prospect was not found.");

  await saveProspect({
    ...prospect,
    contactPersonName: verifiedFirstName,
    activities: [
      activity("outreach", `Verified contact first name saved as ${verifiedFirstName}. The editable first-touch draft will be regenerated. Nothing was sent.`),
      ...prospect.activities,
    ],
  });

  const regenerated = await regenerateProspectOutreachWithCurrentScript(prospect.id);
  if (!regenerated?.queueItem) {
    throw new Error("The verified name was saved, but the linked draft could not be refreshed. Refresh and try again.");
  }

  return {
    item: regenerated.queueItem,
    contactFirstName: verifiedFirstName,
  };
}

'''
replace_once(
    "lib/autonomous-growth-repository.ts",
    'export async function recordAutonomousFeedback(id: string, feedbackLabel: AutonomousFeedbackLabel, note = "") {\n',
    contact_name_function + 'export async function recordAutonomousFeedback(id: string, feedbackLabel: AutonomousFeedbackLabel, note = "") {\n',
)

# API action.
replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '  runSmartAutonomousDryRun,\n  sendQueuedEmailQueueItem,\n',
    '  runSmartAutonomousDryRun,\n  saveVerifiedContactFirstNameAndRegenerate,\n  sendQueuedEmailQueueItem,\n',
)
replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '      previewLink?: string;\n      expectedApprovalSnapshot?: {\n',
    '      previewLink?: string;\n      contactFirstName?: string;\n      expectedUpdatedAt?: string;\n      expectedApprovalSnapshot?: {\n',
)
api_action = r'''    if (payload.action === "save_verified_contact_first_name") {
      if (!payload.queueItemId) return NextResponse.json({ error: "Queue item is required." }, { status: 400 });
      if (typeof payload.contactFirstName !== "string" || !payload.contactFirstName.trim()) {
        return NextResponse.json({ error: "Enter a verified contact first name." }, { status: 400 });
      }
      if (typeof payload.expectedUpdatedAt !== "string" || !payload.expectedUpdatedAt) {
        return NextResponse.json({ error: "Refresh and reopen the exact current draft before saving a contact name." }, { status: 400 });
      }
      try {
        const result = await saveVerifiedContactFirstNameAndRegenerate(
          payload.queueItemId,
          payload.contactFirstName,
          payload.expectedUpdatedAt,
        );
        if (!result) return NextResponse.json({ error: "Queue item was not found." }, { status: 404 });
        return NextResponse.json(result);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "The verified contact name could not be saved." },
          { status: 409 },
        );
      }
    }
'''
replace_once(
    "app/api/engine/autonomous-growth/route.ts",
    '    if (payload.action === "record_feedback") {\n',
    api_action + '    if (payload.action === "record_feedback") {\n',
)

# Review dialog editor.
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    'type DashboardPayload = {\n  queue?: EmailQueueItem[];\n  error?: string;\n};\n\nconst injectedButtonAttribute',
    '''type DashboardPayload = {\n  queue?: EmailQueueItem[];\n  error?: string;\n};\n\nfunction greetingFirstName(item: EmailQueueItem) {\n  const match = item.emailBody.match(/^Hi ([^,\\n]+),/);\n  const value = match?.[1]?.trim() ?? "";\n  return value && value.toLowerCase() !== "there" ? value : "";\n}\n\nconst injectedButtonAttribute''',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");\n',
    '  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");\n  const [contactFirstName, setContactFirstName] = useState("");\n  const [savingContactName, setSavingContactName] = useState(false);\n  const [contactNameMessage, setContactNameMessage] = useState("");\n',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '    setApprovalError("");\n    setCopyState("idle");\n  }, [approving]);\n',
    '    setApprovalError("");\n    setCopyState("idle");\n    setContactFirstName("");\n    setContactNameMessage("");\n  }, [approving]);\n',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '          setSelectedItem(structuredClone(item));\n          setApprovalError("");\n          setCopyState("idle");\n',
    '          setSelectedItem(structuredClone(item));\n          setApprovalError("");\n          setCopyState("idle");\n          setContactFirstName(greetingFirstName(item));\n          setContactNameMessage("");\n',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '      && ["Eligible", "Needs Review"].includes(selectedItem.status)\n      && !approving,\n',
    '      && ["Eligible", "Needs Review"].includes(selectedItem.status)\n      && !approving\n      && !savingContactName,\n',
)
contact_save_function = r'''
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

'''
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '  async function approveFromDialog() {\n',
    contact_save_function + '  async function approveFromDialog() {\n',
)
contact_editor_jsx = r'''
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

'''
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '            <div className="email-draft-review-body">\n',
    contact_editor_jsx + '            <div className="email-draft-review-body">\n',
)
contact_editor_css = r'''
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

'''
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '        .email-draft-review-body {\n',
    contact_editor_css + '        .email-draft-review-body {\n',
)
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '          .email-draft-review-header,\n          .email-draft-review-actions {\n',
    '          .email-draft-review-header,\n          .email-draft-review-actions {\n',
)
# Add a mobile stacking rule without disturbing existing responsive styles.
replace_once(
    "components/engine/EmailDraftReviewHelper.tsx",
    '          .email-draft-review-dialog {\n            max-height: calc(100vh - 20px);\n            border-radius: 14px;\n          }\n\n',
    '          .email-draft-review-dialog {\n            max-height: calc(100vh - 20px);\n            border-radius: 14px;\n          }\n\n          .email-draft-review-contact-name > div {\n            align-items: stretch;\n            flex-direction: column;\n          }\n\n',
)

# Behavioral tests.
replace_once(
    "tests/autonomous-growth.test.ts",
    '  recordEmailSuppression,\n  regenerateUnsentOutreachCopy,\n',
    '  recordEmailSuppression,\n  regenerateUnsentOutreachCopy,\n  saveVerifiedContactFirstNameAndRegenerate,\n',
)
replace_once(
    "tests/autonomous-growth.test.ts",
    'import { reconcileProspectContactRouting, seedProspects, withAnalysis, type Prospect } from "../lib/prospect-engine";\n',
    'import { generateOutreach, reconcileProspectContactRouting, seedProspects, withAnalysis, type Prospect } from "../lib/prospect-engine";\n',
)

autonomous_test = r'''

test("verified contact first name save updates the prospect and only the linked editable draft", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetProspectMemoryForTests();
  resetOperationalMemoryForTests();
  try {
    const prospect = eligibleProspect();
    Object.assign(prospect, {
      id: "verified-name-editor-prospect",
      businessName: "Pinnacle Pressure Washing of Toledo",
      city: "Toledo",
      state: "OH",
      email: "nick@pinnacle419.com",
      contactPersonName: "",
    });
    prospect.outreach = generateOutreach(prospect, publicLink);
    await saveProspect(prospect);
    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect,
      topProspectResultId: "verified-name-editor-result",
    });
    assert.match(queued.emailBody, /^Hi there,/);

    const result = await saveVerifiedContactFirstNameAndRegenerate(queued.id, "Nick Smith", queued.updatedAt);
    assert.equal(result?.contactFirstName, "Nick");
    assert.match(result?.item.emailBody ?? "", /^Hi Nick,/);
    assert.equal((await getProspect(prospect.id))?.contactPersonName, "Nick");
    assert.equal(result?.item.status, queued.status);
    assert.equal(result?.item.sentDate, "");

    await assert.rejects(
      saveVerifiedContactFirstNameAndRegenerate(result!.item.id, "nick@pinnacle419.com", result!.item.updatedAt),
      /verified person's first name/i,
    );
    await assert.rejects(
      saveVerifiedContactFirstNameAndRegenerate(result!.item.id, "Owner", result!.item.updatedAt),
      /verified person's first name/i,
    );
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});
'''
Path("tests/autonomous-growth.test.ts").write_text(
    Path("tests/autonomous-growth.test.ts").read_text().rstrip() + autonomous_test + "\n"
)

ui_audit_test = r'''

test("email draft review supports verified-name save and exact single-draft regeneration", () => {
  const helper = readFileSync("components/engine/EmailDraftReviewHelper.tsx", "utf8");
  const route = readFileSync("app/api/engine/autonomous-growth/route.ts", "utf8");
  const repository = readFileSync("lib/autonomous-growth-repository.ts", "utf8");
  assert.match(helper, /Verified contact first name/);
  assert.match(helper, /save_verified_contact_first_name/);
  assert.match(helper, /expectedUpdatedAt: selectedItem\.updatedAt/);
  assert.match(helper, /will not infer a name from the email address/i);
  assert.match(route, /saveVerifiedContactFirstNameAndRegenerate/);
  assert.match(repository, /queueItemDraftMutationIsProtected\(queueItem\)/);
  assert.match(repository, /webworkshopRecipientFirstName\(value\)/);
  assert.match(repository, /regenerateProspectOutreachWithCurrentScript\(prospect\.id\)/);
});
'''
Path("tests/final-manual-workflow-audit.test.ts").write_text(
    Path("tests/final-manual-workflow-audit.test.ts").read_text().rstrip() + ui_audit_test + "\n"
)
