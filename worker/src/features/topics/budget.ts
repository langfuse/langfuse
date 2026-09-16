import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

const DEVELOPER_LIMIT_USD = 0.25;
type Reservation = {
  executionId: string;
  estimateUsd: number;
  actualUsd: number | null;
};
type Ledger = { version: 1; reservations: Record<string, Reservation> };

export class TopicsBudgetExhausted extends Error {}
export class TopicsUncertainCall extends Error {}

/** Reservations survive crashes: an uncertain provider response is never retried for free. */
export class TopicsBudget {
  constructor(private readonly root: string) {}

  private async read(): Promise<Ledger> {
    try {
      return JSON.parse(
        await readFile(path.join(this.root, "developer-budget.json"), "utf8"),
      ) as Ledger;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { version: 1, reservations: {} };
      throw error;
    }
  }

  private async update(change: (ledger: Ledger) => void): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const lockPath = path.join(this.root, "developer-budget.lock");
    const lock = await open(lockPath, "wx", 0o600).catch(() => {
      throw new Error(
        "Topics budget is locked by another worker or an interrupted run; inspect the local lock before retrying.",
      );
    });
    const temporary = path.join(this.root, `.${randomUUID()}.budget.tmp`);
    try {
      const ledger = await this.read();
      change(ledger);
      const output = await open(temporary, "wx", 0o600);
      try {
        await output.writeFile(JSON.stringify(ledger));
        await output.sync();
      } finally {
        await output.close();
      }
      await rename(temporary, path.join(this.root, "developer-budget.json"));
      const directory = await open(this.root, "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
      await rm(temporary, { force: true });
    }
  }

  async reserve(
    key: string,
    executionId: string,
    estimateUsd: number,
    executionLimitUsd: number,
  ): Promise<void> {
    if (!Number.isFinite(estimateUsd) || estimateUsd <= 0)
      throw new Error("Invalid Topics cost estimate.");
    await this.update((ledger) => {
      if (ledger.reservations[key])
        throw new TopicsUncertainCall(
          "A previous provider call has no accepted checkpoint; automatic retry is disabled to preserve the budget.",
        );
      const entries = Object.values(ledger.reservations);
      const total = entries.reduce((sum, entry) => sum + entry.estimateUsd, 0);
      const executionTotal = entries
        .filter((entry) => entry.executionId === executionId)
        .reduce((sum, entry) => sum + entry.estimateUsd, 0);
      if (
        total + estimateUsd > DEVELOPER_LIMIT_USD ||
        executionTotal + estimateUsd >
          Math.min(executionLimitUsd, DEVELOPER_LIMIT_USD)
      ) {
        throw new TopicsBudgetExhausted(
          "Topics stopped before another model call: the aggregate $0.25 developer budget or execution budget would be exceeded.",
        );
      }
      ledger.reservations[key] = { executionId, estimateUsd, actualUsd: null };
    });
  }

  async complete(key: string, actualUsd: number): Promise<void> {
    await this.update((ledger) => {
      if (!ledger.reservations[key])
        throw new Error("Topics provider result has no budget reservation.");
      ledger.reservations[key].actualUsd = actualUsd;
    });
  }

  async totals(executionId: string) {
    const entries = Object.values((await this.read()).reservations).filter(
      (entry) => entry.executionId === executionId,
    );
    return {
      reservedCostUsd: entries.reduce(
        (sum, entry) => sum + entry.estimateUsd,
        0,
      ),
      spentCostUsd: entries.reduce(
        (sum, entry) => sum + (entry.actualUsd ?? 0),
        0,
      ),
    };
  }
}
