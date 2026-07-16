import { prepareProspectForPreview, type PreviewPreparationOptions } from "@/lib/preview-preparation";
import type { Prospect } from "@/lib/prospect-engine";
import { prepareTopProspectArtifactsFromPreview, type OutreachPreference } from "@/lib/top-prospects";

export async function prepareTopProspectArtifactsWithResearch(
  prospect: Prospect,
  previewLink: string,
  outreachPreference: OutreachPreference = "written_only",
  preparationOptions: PreviewPreparationOptions = {},
) {
  const prepared = await prepareProspectForPreview(prospect, preparationOptions);
  return {
    ...prepareTopProspectArtifactsFromPreview(prepared.prospect, prepared.preview, previewLink, outreachPreference),
    previewPreparation: {
      researchStatus: prepared.researchStatus,
      researchNote: prepared.researchNote,
    },
  };
}
