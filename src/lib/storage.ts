import "server-only";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

// Local-disk storage. Public files: listing photos. Private files: ID documents, payment proofs.
// To move to S3 or another object store, replace these four functions.
const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
type Bucket = "public" | "private";

function resolveKey(bucket: Bucket, key: string) {
  const p = path.resolve(ROOT, bucket, key);
  if (!p.startsWith(path.resolve(ROOT, bucket) + path.sep)) throw new Error("Bad key");
  return p;
}
export async function putFile(bucket: Bucket, key: string, data: Buffer) {
  const p = resolveKey(bucket, key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
  return key;
}
export async function getFile(bucket: Bucket, key: string) {
  const p = resolveKey(bucket, key);
  await stat(p);
  return readFile(p);
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const DOC_TYPES = [...IMAGE_TYPES, "application/pdf"];

/** Listing photo: at least 1200 px wide, stored as WebP (max 1920 px) plus a 640 px thumbnail; returns a 64-bit dHash. */
export async function savePhoto(listingId: string, file: File) {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error("photo_type");
  if (file.size > 20 * 1024 * 1024) throw new Error("photo_size");
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const img = sharp(buf, { failOn: "error" }).rotate();
    const meta = await img.metadata();
    const width = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width; // EXIF 5-8 = rotated 90°
    if (!width || width < 1200) throw new Error("photo_small");
    const id = randomUUID();
    const full = await img.clone().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const thumb = await img.clone().resize({ width: 640 }).webp({ quality: 78 }).toBuffer();
    await putFile("public", `listings/${listingId}/${id}.webp`, full.data);
    await putFile("public", `listings/${listingId}/${id}_t.webp`, thumb);
    return { fileKey: `listings/${listingId}/${id}.webp`, width: full.info.width, height: full.info.height, phash: await dHash(buf) };
  } catch (e) {
    // Anything sharp cannot read (a renamed file, a broken download, an unsupported HEIC) → "not a photo".
    throw new Error(e instanceof Error && e.message.startsWith("photo_") ? e.message : "photo_type");
  }
}

/** Private document (ID, ownership papers, payment proof). Images are re-encoded to strip metadata. */
export async function saveDocument(folder: string, file: File) {
  if (!DOC_TYPES.includes(file.type)) throw new Error("doc_type");
  if (file.size > 15 * 1024 * 1024) throw new Error("doc_size");
  const buf = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  if (file.type === "application/pdf") {
    if (buf.subarray(0, 4).toString() !== "%PDF") throw new Error("doc_type");
    return putFile("private", `${folder}/${id}.pdf`, buf);
  }
  const clean = await sharp(buf).rotate().resize({ width: 2000, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return putFile("private", `${folder}/${id}.jpg`, clean);
}

/** Difference hash: 9x8 grayscale, compare neighbours → 64 bits as 16 hex chars. */
export async function dHash(buf: Buffer) {
  const px = await sharp(buf).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? "1" : "0";
  return BigInt("0b" + bits).toString(16).padStart(16, "0");
}
export { hamming } from "./phash";
export { photoUrl } from "./urls";
