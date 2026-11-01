import { db, type Tx } from "./db";
import { auditLogs } from "@/db/schema";

const plain = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

export async function audit(actorId: string | null, action: string, entity: string, entityId: string, before?: unknown, after?: unknown, tx: Tx | typeof db = db) {
  await tx.insert(auditLogs).values({ actorId, action, entity, entityId, before: plain(before), after: plain(after) });
}
