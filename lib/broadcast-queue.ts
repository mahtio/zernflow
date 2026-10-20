const MAX_ATTEMPTS = 3;

async function waitBeforeRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
}

/** Retries queue triggers, never individual messages or recipient statuses. */
export async function processBroadcastQueueBatch(): Promise<{ total: number }> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch("/api/cron/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      });
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      await waitBeforeRetry(attempt);
      continue;
    }

    if (!response.ok) {
      const transient = response.status === 408 || response.status === 429 || response.status >= 500;
      if (transient && attempt < MAX_ATTEMPTS - 1) {
        await waitBeforeRetry(attempt);
        continue;
      }
      const data = await response.json().catch(() => null);
      throw new Error(
        typeof data?.error === "string" ? data.error : `Queue request failed (${response.status})`
      );
    }

    const data = await response.json();
    if (!Number.isInteger(data?.total) || data.total < 0) {
      throw new Error("Invalid queue response");
    }
    return { total: data.total };
  }
  throw new Error("Queue request failed");
}
