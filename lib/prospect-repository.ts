import { Prisma, PrismaClient, ProspectStatus as PrismaProspectStatus } from "@prisma/client";
import {
  displayStateCode,
  normalizeTradeCategory,
  OUTREACH_COPY_VERSION,
  contactEvidenceKinds,
  contactEvidenceMethods,
  inferOutreachCopyVersion,
  outreachDraftLooksCurrent,
  prospectFitDispositions,
  seedProspects,
  titleCaseLocation,
  type Activity,
  type Analysis,
  type OutreachDraft,
  type PreviewConcept,
  type Prospect,
  type ProspectStatus,
  type ContactRouteEvidence,
} from "@/lib/prospect-engine";
import { parseWebsiteVerificationReport } from "@/lib/prospect-validation";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";

const globalStore = globalThis as typeof globalThis & {
  prospectMemory?: Prospect[];
  prisma?: PrismaClient;
};

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

function assertPersistenceAvailable() {
  if (!hasDatabase && process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required for Prospect Engine production persistence.");
  }
}

export function getProspectDatabase() {
  if (!globalStore.prisma) globalStore.prisma = new PrismaClient();
  return globalStore.prisma;
}

function getMemoryStore() {
  if (!globalStore.prospectMemory) globalStore.prospectMemory = structuredClone(seedProspects);
  return globalStore.prospectMemory;
}

const toPrismaStatus: Record<ProspectStatus, PrismaProspectStatus> = {
  New: "NEW",
  Reviewed: "REVIEWED",
  Contacted: "CONTACTED",
  Interested: "INTERESTED",
  "Proposal Sent": "PROPOSAL_SENT",
  "Closed Won": "CLOSED_WON",
  "Closed Lost": "CLOSED_LOST",
};

const fromPrismaStatus: Record<PrismaProspectStatus, ProspectStatus> = {
  NEW: "New",
  REVIEWED: "Reviewed",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  PROPOSAL_SENT: "Proposal Sent",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};

const prospectInclude = {
  analyses: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1 },
  outreach: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1 },
  previews: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1 },
  notes: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] },
  activities: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }] },
} satisfies Prisma.ProspectInclude;

type StoredProspect = Prisma.ProspectGetPayload<{ include: typeof prospectInclude }>;

export type ProspectListDiagnostics = {
  malformedRecordsOmitted: number;
};

export type ProspectListResult = {
  prospects: Prospect[];
  diagnostics: ProspectListDiagnostics;
};

export class ProspectRecordsUnreadableError extends Error {
  constructor(public readonly recordCount: number) {
    super("Saved prospect records could not be decoded.");
    this.name = "ProspectRecordsUnreadableError";
  }
}

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function contactEvidenceArray(value: Prisma.JsonValue): ContactRouteEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    if (
      !contactEvidenceKinds.includes(item.kind as ContactRouteEvidence["kind"])
      || !contactEvidenceMethods.includes(item.extractionMethod as ContactRouteEvidence["extractionMethod"])
      || !["high", "medium", "low"].includes(String(item.confidence))
      || typeof item.value !== "string"
      || typeof item.sourceUrl !== "string"
      || typeof item.domainMatchesBusiness !== "boolean"
      || typeof item.discoveredAt !== "string"
    ) return [];
    return [{
      kind: item.kind as ContactRouteEvidence["kind"],
      value: item.value,
      sourceUrl: item.sourceUrl,
      extractionMethod: item.extractionMethod as ContactRouteEvidence["extractionMethod"],
      confidence: item.confidence as ContactRouteEvidence["confidence"],
      domainMatchesBusiness: item.domainMatchesBusiness,
      discoveredAt: item.discoveredAt,
      lastVerifiedAt: typeof item.lastVerifiedAt === "string" ? item.lastVerifiedAt : undefined,
      sourceType: ["owned_website", "official_social", "provider", "directory", "unknown"].includes(String(item.sourceType))
        ? item.sourceType as ContactRouteEvidence["sourceType"]
        : undefined,
      firstParty: typeof item.firstParty === "boolean" ? item.firstParty : undefined,
      decision: ["autonomous_eligible", "manual_review_required", "rejected"].includes(String(item.decision))
        ? item.decision as ContactRouteEvidence["decision"]
        : undefined,
      decisionReason: typeof item.decisionReason === "string" ? item.decisionReason : undefined,
    }];
  });
}

function toDomain(row: StoredProspect): Prospect {
  const analysisRow = row.analyses[0];
  const outreachRow = row.outreach[0];
  const previewRow = row.previews[0];
  const analysis = analysisRow
    ? ({
        overallScore: analysisRow.overallScore,
        opportunityRating: analysisRow.opportunityRating as Analysis["opportunityRating"],
        scores: analysisRow.categoryScores as Analysis["scores"],
        strengths: stringArray(analysisRow.strengths),
        weaknesses: stringArray(analysisRow.weaknesses),
        summary: analysisRow.summary,
        redesignDirection: analysisRow.redesignDirection,
        analyzedAt: analysisRow.createdAt.toISOString(),
      } satisfies Analysis)
    : undefined;
  const outreach = outreachRow
    ? (() => {
      const draft = {
        subjects: stringArray(outreachRow.subjectLines),
        concise: outreachRow.conciseBody,
        detailed: outreachRow.detailedBody,
        followUps: stringArray(outreachRow.followUps),
        approved: Boolean(outreachRow.approvedAt),
        generatedAt: outreachRow.createdAt.toISOString(),
        outreachCopyVersion: OUTREACH_COPY_VERSION,
        outreachCopyGeneratedAt: outreachRow.createdAt.toISOString(),
      } satisfies OutreachDraft;
      return {
        ...draft,
        outreachCopyVersion: inferOutreachCopyVersion(draft),
        approved: outreachDraftLooksCurrent({ ...draft, outreachCopyVersion: inferOutreachCopyVersion(draft) }) ? draft.approved : false,
      } satisfies OutreachDraft;
    })()
    : undefined;
  const preview = previewRow
    ? ({ ...(previewRow.content as PreviewConcept), generatedAt: previewRow.createdAt.toISOString() } satisfies PreviewConcept)
    : undefined;

  return {
    id: row.id,
    businessName: row.businessName,
    website: row.website ?? "",
    profileUrl: row.profileUrl ?? "",
    prospectType: row.prospectType as Prospect["prospectType"],
    classification: row.classification as Prospect["classification"],
    phone: row.phone ?? "",
    email: row.publicEmail ?? "",
    contactPageUrl: row.contactPageUrl ?? "",
    contactFormUrl: row.contactFormUrl ?? "",
    quoteFormUrl: row.quoteFormUrl ?? "",
    contactFormDetected: row.contactFormDetected,
    quoteFormDetected: row.quoteFormDetected,
    facebookUrl: row.facebookUrl ?? "",
    instagramUrl: row.instagramUrl ?? "",
    linkedinUrl: row.linkedinUrl ?? "",
    xUrl: row.xUrl ?? "",
    youtubeUrl: row.youtubeUrl ?? "",
    contactPersonName: row.contactPersonName ?? "",
    contactConfidence: row.contactConfidence as Prospect["contactConfidence"],
    bestManualContactMethod: row.bestManualContactMethod as Prospect["bestManualContactMethod"],
    contactDiscoveryNotes: stringArray(row.contactDiscoveryNotes),
    contactEvidence: contactEvidenceArray(row.contactEvidence),
    address: row.address ?? "",
    city: titleCaseLocation(row.city),
    state: displayStateCode(row.state),
    trade: normalizeTradeCategory(row.tradeCategory) ?? "General Contractor",
    status: fromPrismaStatus[row.status],
    serviceArea: row.serviceArea ?? "",
    sizeIndicator: (row.sizeIndicator ?? "Small") as Prospect["sizeIndicator"],
    priorityScore: row.priorityScore,
    rating: row.rating,
    reviewCount: row.reviewCount,
    recentReviewCount: row.recentReviewCount,
    sourceConfidence: row.sourceConfidence,
    activitySignals: stringArray(row.activitySignals),
    recommendedContactMethod: row.recommendedContactMethod as Prospect["recommendedContactMethod"],
    inactive: row.inactive,
    websiteStatus: row.websiteStatus as Prospect["websiteStatus"],
    websiteStatusDetail: row.websiteStatusDetail ?? "",
    websiteAnalysisAttemptedAt: row.websiteAnalysisAttemptedAt?.toISOString() ?? "",
    websiteVerification: parseWebsiteVerificationReport(row.websiteVerification),
    fitDisposition: prospectFitDispositions.includes(row.fitDisposition as Prospect["fitDisposition"])
      ? row.fitDisposition as Prospect["fitDisposition"]
      : "unreviewed",
    analysis,
    outreach,
    preview,
    notes: row.notes.map((note) => note.body),
    activities: row.activities.map(
      (item) =>
        ({
          id: item.id,
          type: item.type as Activity["type"],
          label: item.label,
          at: item.createdAt.toISOString(),
        }) satisfies Activity,
    ),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function persistProspectInTransaction(
  tx: Prisma.TransactionClient,
  prospect: Prospect,
) {
    const previous = await tx.prospect.findUnique({ where: { id: prospect.id }, select: { status: true, prospectType: true } });
    await tx.prospect.upsert({
      where: { id: prospect.id },
      create: {
        id: prospect.id,
        businessName: prospect.businessName,
        website: prospect.website || null,
        profileUrl: prospect.profileUrl || null,
        prospectType: prospect.prospectType,
        classification: prospect.classification,
        phone: prospect.phone || null,
        publicEmail: prospect.email || null,
        contactPageUrl: prospect.contactPageUrl || null,
        contactFormUrl: prospect.contactFormUrl || null,
        quoteFormUrl: prospect.quoteFormUrl || null,
        contactFormDetected: prospect.contactFormDetected,
        quoteFormDetected: prospect.quoteFormDetected,
        facebookUrl: prospect.facebookUrl || null,
        instagramUrl: prospect.instagramUrl || null,
        linkedinUrl: prospect.linkedinUrl || null,
        xUrl: prospect.xUrl || null,
        youtubeUrl: prospect.youtubeUrl || null,
        contactPersonName: prospect.contactPersonName || null,
        contactConfidence: prospect.contactConfidence,
        bestManualContactMethod: prospect.bestManualContactMethod,
        contactDiscoveryNotes: prospect.contactDiscoveryNotes,
        contactEvidence: prospect.contactEvidence,
        address: prospect.address || null,
        city: titleCaseLocation(prospect.city),
        state: displayStateCode(prospect.state),
        tradeCategory: normalizeTradeCategory(prospect.trade) ?? "General Contractor",
        serviceArea: prospect.serviceArea,
        sizeIndicator: prospect.sizeIndicator,
        priorityScore: prospect.priorityScore,
        rating: prospect.rating,
        reviewCount: prospect.reviewCount,
        recentReviewCount: prospect.recentReviewCount,
        sourceConfidence: prospect.sourceConfidence,
        activitySignals: prospect.activitySignals,
        recommendedContactMethod: prospect.recommendedContactMethod,
        inactive: prospect.inactive,
        websiteStatus: prospect.websiteStatus,
        websiteStatusDetail: prospect.websiteStatusDetail || null,
        websiteAnalysisAttemptedAt: prospect.websiteAnalysisAttemptedAt ? new Date(prospect.websiteAnalysisAttemptedAt) : null,
        websiteVerification: prospect.websiteVerification ?? undefined,
        fitDisposition: prospect.fitDisposition,
        status: toPrismaStatus[prospect.status],
        createdAt: new Date(prospect.createdAt),
      },
      update: {
        businessName: prospect.businessName,
        website: prospect.website || null,
        profileUrl: prospect.profileUrl || null,
        prospectType: prospect.prospectType,
        classification: prospect.classification,
        phone: prospect.phone || null,
        publicEmail: prospect.email || null,
        contactPageUrl: prospect.contactPageUrl || null,
        contactFormUrl: prospect.contactFormUrl || null,
        quoteFormUrl: prospect.quoteFormUrl || null,
        contactFormDetected: prospect.contactFormDetected,
        quoteFormDetected: prospect.quoteFormDetected,
        facebookUrl: prospect.facebookUrl || null,
        instagramUrl: prospect.instagramUrl || null,
        linkedinUrl: prospect.linkedinUrl || null,
        xUrl: prospect.xUrl || null,
        youtubeUrl: prospect.youtubeUrl || null,
        contactPersonName: prospect.contactPersonName || null,
        contactConfidence: prospect.contactConfidence,
        bestManualContactMethod: prospect.bestManualContactMethod,
        contactDiscoveryNotes: prospect.contactDiscoveryNotes,
        contactEvidence: prospect.contactEvidence,
        address: prospect.address || null,
        city: titleCaseLocation(prospect.city),
        state: displayStateCode(prospect.state),
        tradeCategory: normalizeTradeCategory(prospect.trade) ?? "General Contractor",
        serviceArea: prospect.serviceArea,
        sizeIndicator: prospect.sizeIndicator,
        priorityScore: prospect.priorityScore,
        rating: prospect.rating,
        reviewCount: prospect.reviewCount,
        recentReviewCount: prospect.recentReviewCount,
        sourceConfidence: prospect.sourceConfidence,
        activitySignals: prospect.activitySignals,
        recommendedContactMethod: prospect.recommendedContactMethod,
        inactive: prospect.inactive,
        websiteStatus: prospect.websiteStatus,
        websiteStatusDetail: prospect.websiteStatusDetail || null,
        websiteAnalysisAttemptedAt: prospect.websiteAnalysisAttemptedAt ? new Date(prospect.websiteAnalysisAttemptedAt) : null,
        websiteVerification: prospect.websiteVerification ?? Prisma.JsonNull,
        fitDisposition: prospect.fitDisposition,
        status: toPrismaStatus[prospect.status],
      },
    });

    if (previous && previous.prospectType !== prospect.prospectType) {
      await tx.analysis.deleteMany({ where: { prospectId: prospect.id } });
      await tx.outreachDraft.deleteMany({ where: { prospectId: prospect.id } });
      await tx.previewConcept.deleteMany({ where: { prospectId: prospect.id } });
    }

    if (prospect.analysis) {
      const createdAt = new Date(prospect.analysis.analyzedAt);
      const data = {
        overallScore: prospect.analysis.overallScore,
        opportunityRating: prospect.analysis.opportunityRating,
        categoryScores: prospect.analysis.scores,
        strengths: prospect.analysis.strengths,
        weaknesses: prospect.analysis.weaknesses,
        summary: prospect.analysis.summary,
        redesignDirection: prospect.analysis.redesignDirection,
      };
      await tx.analysis.upsert({
        where: { prospectId_createdAt: { prospectId: prospect.id, createdAt } },
        update: data,
        create: { prospectId: prospect.id, createdAt, ...data },
      });
    }
    if (prospect.outreach) {
      const createdAt = new Date(prospect.outreach.generatedAt);
      const existing = await tx.outreachDraft.findUnique({ where: { prospectId_createdAt: { prospectId: prospect.id, createdAt } }, select: { approvedAt: true } });
      const data = {
        subjectLines: prospect.outreach.subjects,
        conciseBody: prospect.outreach.concise,
        detailedBody: prospect.outreach.detailed,
        followUps: prospect.outreach.followUps,
        approvedAt: prospect.outreach.approved ? existing?.approvedAt ?? new Date() : null,
      };
      await tx.outreachDraft.upsert({
        where: { prospectId_createdAt: { prospectId: prospect.id, createdAt } },
        update: data,
        create: { prospectId: prospect.id, createdAt, ...data },
      });
    }
    if (prospect.preview) {
      const createdAt = new Date(prospect.preview.generatedAt);
      const data = { content: prospect.preview };
      await tx.previewConcept.upsert({
        where: { prospectId_createdAt: { prospectId: prospect.id, createdAt } },
        update: data,
        create: { prospectId: prospect.id, createdAt, ...data },
      });
    }
    if (prospect.notes.length) {
      const existing = new Set((await tx.note.findMany({ where: { prospectId: prospect.id }, select: { body: true } })).map((note) => note.body));
      const newNotes = prospect.notes.filter((body) => !existing.has(body));
      if (newNotes.length) await tx.note.createMany({ data: newNotes.map((body) => ({ prospectId: prospect.id, body })) });
    }
    if (prospect.activities.length) {
      await tx.activity.createMany({
        data: prospect.activities.map((item) => ({
          id: item.id,
          prospectId: prospect.id,
          type: item.type,
          label: item.label,
          createdAt: new Date(item.at),
        })),
        skipDuplicates: true,
      });
    }
    if (previous && previous.status !== toPrismaStatus[prospect.status]) {
      await tx.statusHistory.create({
        data: { prospectId: prospect.id, fromStatus: previous.status, toStatus: toPrismaStatus[prospect.status] },
      });
    }
}

async function persistProspect(prospect: Prospect) {
  const prisma = getProspectDatabase();
  await prisma.$transaction(async (tx) => {
    await persistProspectInTransaction(tx, prospect);
  });
}

export async function getProspectInTransaction(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<Prospect | null> {
  const row = await tx.prospect.findUnique({ where: { id }, include: prospectInclude });
  return row ? toDomain(row) : null;
}

export function decodeProspectRows<T extends { id: string }>(
  rows: T[],
  decode: (row: T) => Prospect,
): ProspectListResult {
  const prospects: Prospect[] = [];
  let malformedRecordsOmitted = 0;
  for (const row of rows) {
    try {
      prospects.push(decode(row));
    } catch (error) {
      malformedRecordsOmitted += 1;
      console.error("[prospect-repository] Saved prospect record was omitted after a decode failure.", {
        prospectId: row.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return { prospects, diagnostics: { malformedRecordsOmitted } };
}

export async function listProspectsWithDiagnostics(): Promise<ProspectListResult> {
  assertPersistenceAvailable();
  if (!hasDatabase) {
    return {
      prospects: structuredClone(getMemoryStore()),
      diagnostics: { malformedRecordsOmitted: 0 },
    };
  }
  await ensureTopProspectSchema();
  const prisma = getProspectDatabase();
  const count = await prisma.prospect.count();
  if (count === 0) {
    for (const prospect of seedProspects) await persistProspect(prospect);
  }
  const rows = await prisma.prospect.findMany({ include: prospectInclude, orderBy: { priorityScore: "desc" } });
  const result = decodeProspectRows(rows, toDomain);
  if (rows.length > 0 && result.prospects.length === 0) {
    throw new ProspectRecordsUnreadableError(rows.length);
  }
  return result;
}

export async function listProspects(): Promise<Prospect[]> {
  return (await listProspectsWithDiagnostics()).prospects;
}

export async function saveProspect(prospect: Prospect): Promise<Prospect> {
  assertPersistenceAvailable();
  if (!hasDatabase) {
    const store = getMemoryStore();
    const index = store.findIndex((item) => item.id === prospect.id);
    if (index >= 0) store[index] = structuredClone(prospect);
    else store.unshift(structuredClone(prospect));
    return structuredClone(prospect);
  }
  await ensureTopProspectSchema();
  await persistProspect(prospect);
  const row = await getProspectDatabase().prospect.findUniqueOrThrow({ where: { id: prospect.id }, include: prospectInclude });
  return toDomain(row);
}

export async function getProspect(id: string): Promise<Prospect | null> {
  assertPersistenceAvailable();
  if (!hasDatabase) return structuredClone(getMemoryStore().find((item) => item.id === id) ?? null);
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().prospect.findUnique({ where: { id }, include: prospectInclude });
  return row ? toDomain(row) : null;
}

export async function findProspectByWebsite(website: string): Promise<Prospect | null> {
  assertPersistenceAvailable();
  if (!website.trim()) return null;
  if (!hasDatabase) return structuredClone(getMemoryStore().find((item) => item.website === website) ?? null);
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().prospect.findUnique({ where: { website }, include: prospectInclude });
  return row ? toDomain(row) : null;
}

export async function findProspectByIdentity(input: Pick<Prospect, "businessName" | "phone" | "city" | "state">): Promise<Prospect | null> {
  assertPersistenceAvailable();
  if (!hasDatabase) {
    const matching = getMemoryStore().find((item) =>
      Boolean(input.phone && item.phone === input.phone)
      || (
        item.businessName.toLowerCase() === input.businessName.toLowerCase()
        && item.city.toLowerCase() === input.city.toLowerCase()
        && item.state.toLowerCase() === input.state.toLowerCase()
      ));
    return structuredClone(matching ?? null);
  }
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().prospect.findFirst({
    where: {
      OR: [
        ...(input.phone ? [{ phone: input.phone }] : []),
        {
          businessName: { equals: input.businessName, mode: "insensitive" },
          city: { equals: input.city, mode: "insensitive" },
          state: { equals: input.state, mode: "insensitive" },
        },
      ],
    },
    include: prospectInclude,
  });
  return row ? toDomain(row) : null;
}

export function persistenceMode() {
  return hasDatabase ? "postgresql" : "memory";
}

export function resetProspectMemoryForTests() {
  globalStore.prospectMemory = structuredClone(seedProspects);
}

export function setProspectMemoryForTests(prospects: Prospect[]) {
  globalStore.prospectMemory = structuredClone(prospects);
}
