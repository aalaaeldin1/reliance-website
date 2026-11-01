import { getFile } from "@/lib/storage";

// Public listing photos. ID documents and payment proofs live in the private bucket (see /api/private).
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const k = key.join("/");
  if (!/^listings\/[\w-]+\/[\w-]+\.webp$/.test(k)) return new Response("Not found", { status: 404 });
  try {
    const buf = await getFile("public", k);
    return new Response(new Uint8Array(buf), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
