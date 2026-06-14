import { PrismaClient, ProspectStatus as PrismaProspectStatus, type Prisma } from "@prisma/client";
import {
  seedProspects,
  type Activity,
  type Analysis,
  type OutreachDraft,
  type PreviewConcept,
  type Prospect,
  type ProspectStatus,
  type TradeCategory,
} from "@/lib/prospect-engine";
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
  analyses: { orderBy: { createdAt: "desc" as const }, take: 1 },
  outreach: { orderBy: { createdAt: "desc" as const }, take: 1 },
  previews: { orderBy: { createdAt: "desc" as const }, take: 1 },
  notes: { orderBy: { createdAt: "desc" as const } },
  activities: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.ProspectInclude;

type StoredProspect = Prisma.ProspectGetPayload<{ include: typeof prospectInclude }>;

function stringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
    ? ({
        subjects: stringArray(outreachRow.subjectLines),
        concise: outreachRow.conciseBody,
        detailed: outreachRow.detailedBody,
        followUps: stringArray(outreachRow.followUps),
        approved: Boolean(outreachRow.approvedAt),
        generatedAt: outreachRow.createdAt.toISOString(),
      } satisfies OutreachDraft)
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
    contactFormUrl: row.contactFormUrl ?? "",
    address: row.address ?? "",
    city: row.city,
    state: row.state,
    trade: row.tradeCategory as TradeCategory,
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

async function persistProspect(prospect: Prospect) {
  const prisma = getProspectDatabase();

  await prisma.$transaction(async (tx) => {
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
        contactFormUrl: prospect.contactFormUrl || null,
        address: prospect.address || null,
        city: prospect.city,
        state: prospect.state,
        tradeCategory: prospect.trade,
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
        contactFormUrl: prospect.contactFormUrl || null,
        address: prospect.address || null,
        city: prospect.city,
        state: prospect.state,
        tradeCategory: prospect.trade,
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
  });
}

export async function listProspects(): Promise<Prospect[]> {
  assertPersistenceAvailable();
  if (!hasDatabase) return structuredClone(getMemoryStore());
  await ensureTopProspectSchema();
  const prisma = getProspectDatabase();
  const count = await prisma.prospect.count();
  if (count === 0) {
    for (const prospect of seedProspects) await persistProspect(prospect);
  }
  return (await prisma.prospect.findMany({ include: prospectInclude, orderBy: { priorityScore: "desc" } })).map(toDomain);
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
