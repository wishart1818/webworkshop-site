import { after } from "next/server";
import { processTopProspectJob } from "@/lib/top-prospect-worker";

export function continueTopProspectJobAfterResponse(_request: Request, jobId: string) {
  after(async () => {
    try {
      const result = await processTopProspectJob(jobId);
      if (result.shouldContinue) {
        console.info("[top-prospects] Direct worker continuation completed one batch; durable cron will resume remaining work.", {
          status: result.status,
        });
      }
    } catch (error) {
      console.error("[top-prospects] Direct worker continuation failed safely; durable cron can retry the persisted job.", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  });
}
