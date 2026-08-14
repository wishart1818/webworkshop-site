import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { createTopProspectJob } from "@/lib/top-prospect-repository";
import { validateTopProspectInput, type TopProspectInput } from "@/lib/top-prospects";

export class TopProspectInputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopProspectInputValidationError";
  }
}

type StartTopProspectDependencies = {
  createJob: (input: TopProspectInput) => Promise<{ id: string }>;
  continueJob: (request: Request, jobId: string) => void;
};

const startDependencies: StartTopProspectDependencies = {
  createJob: createTopProspectJob,
  continueJob: continueTopProspectJobAfterResponse,
};

export type StartedTopProspectSearch = {
  jobId: string;
  input: TopProspectInput;
};

export async function startTopProspectSearch(
  request: Request,
  rawInput: unknown,
  dependencies: StartTopProspectDependencies = startDependencies,
): Promise<StartedTopProspectSearch> {
  const validation = validateTopProspectInput(rawInput);
  if (!validation.ok) throw new TopProspectInputValidationError(validation.error);

  const job = await dependencies.createJob(validation.value);
  dependencies.continueJob(request, job.id);
  return { jobId: job.id, input: validation.value };
}
