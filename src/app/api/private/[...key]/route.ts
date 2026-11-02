import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { kycDocuments, payments } from "@/db/schema";
import { getCurrent } from "@/lib/auth";
import { getFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

// Private files (IDs, ownership papers, payment proofs): staff, or the person who uploaded them. Every staff view is logged.
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const k = key.join("/");
  if (!/^[\w-]+(\/[\w-]+)*\.(jpg|pdf)$/.test(k)) return new Response("Not found", { status: 404 });
  const cur = await getCurrent();
  if (!cur) return new Response("Not found", { status: 404 });
  const staff = cur.user.staffRole !== "none" && cur.staff2fa;
  if (!staff) {
    const own = await db.query.kycDocuments.findFirst({ where: and(eq(kycDocuments.fileKey, k), eq(kycDocuments.userId, cur.user.id)) });
    if (!own) return new Response("Not found", { status: 404 });
  } else {
    // Verifiers see identity and ownership documents; Finance sees payment receipts; Super admin sees both.
    const role = cur.user.staffRole;
    const isDoc = role !== "finance" && (await db.query.kycDocuments.findFirst({ where: eq(kycDocuments.fileKey, k) }));
    const isProof = role !== "verifier" && (await db.query.payments.findFirst({ where: eq(payments.proofFileKey, k) }));
    if (!isDoc && !isProof) return new Response("Not found", { status: 404 });
    await audit(cur.user.id, "file.view", "File", k);
  }
  try {
    const buf = await getFile("private", k);
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": k.endsWith(".pdf") ? "application/pdf" : "image/jpeg", "cache-control": "private, no-store", "x-robots-tag": "noindex", "content-disposition": "inline" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
