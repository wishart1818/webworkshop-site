import {
  generatePreview,
  regeneratePreview,
  type PreviewConcept,
  type Prospect,
} from "@/lib/prospect-engine";
import {
  researchProspectForPreviewOutcome,
  type PreviewResearchOutcome,
  type PreviewResearchStatus,
} from "@/lib/preview-business-research";

export type PreviewPreparationMode = "generate" | "regenerate";

export type PreviewPreparationOptions = {
  mode?: PreviewPreparationMode;
  feedback?: string;
  researchTimeoutMs?: number;
  researcher?: (prospect: Prospect) => Promise<PreviewResearchOutcome>;
};

export type PreparedProspectPreview = {
  prospect: Prospect;
  preview: PreviewConcept;
  researchStatus: PreviewResearchStatus;
  researchNote: string;
};

function prospectWithResearchOutcome(prospect: Prospect, status: PreviewResearchStatus, note: string) {
  return {
    ...prospect,
    previewResearchStatus: status,
    previewResearchNote: note,
  } as Prospect;
}

async function boundedResearch(
  prospect: Prospect,
  timeoutMs: number,
  researcher: (prospect: Prospect) => Promise<PreviewResearchOutcome>,
): Promise<PreviewResearchOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PreviewResearchOutcome>((resolve) => {
    timer = setTimeout(() => {
      const note = "Official website research reached its time limit; provider facts and honest fallbacks were retained.";
      resolve({ prospect: prospectWithResearchOutcome(prospect, "timed_out", note), status: "timed_out", note });
    }, timeoutMs);
  });
  try {
    return await Promise.race([researcher(prospect), timeout]);
  } catch {
    const note = "Official website research was unavailable; provider facts and honest fallbacks were retained.";
    return { prospect: prospectWithResearchOutcome(prospect, "failed", note), status: "failed", note };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function prepareProspectForPreview(
  prospect: Prospect,
  options: PreviewPreparationOptions = {},
): Promise<PreparedProspectPreview> {
  const timeoutMs = Math.max(50, Math.min(options.researchTimeoutMs ?? 15_000, 20_000));
  const research = await boundedResearch(
    prospect,
    timeoutMs,
    options.researcher ?? researchProspectForPreviewOutcome,
  );
  const preparedProspect = options.mode === "regenerate"
    ? regeneratePreview(research.prospect, options.feedback ?? "")
    : { ...research.prospect, preview: generatePreview(research.prospect) };
  if (!preparedProspect.preview) throw new Error("Preview preparation did not produce a preview.");
  return {
    prospect: preparedProspect,
    preview: preparedProspect.preview,
    researchStatus: research.status,
    researchNote: research.note,
  };
}
