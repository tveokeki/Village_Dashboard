import crypto from "crypto";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageSize = 8 * 1024 * 1024;

const extByType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export type RegistrationImageUpload = {
  image_path: string;
  image_name: string;
  image_size_bytes: number;
  image_mime_type: string;
};

export async function saveRegistrationImage(file: File | null, folder: "registration-members" | "registration-pets") {
  if (!file || file.size === 0) return null;
  if (!allowedImageTypes.has(file.type)) {
    const err: any = new Error("Unsupported image type. Please upload JPG, PNG, WEBP, or GIF.");
    err.status = 400;
    throw err;
  }
  if (file.size > maxImageSize) {
    const err: any = new Error("Image is too large (max 8MB).");
    err.status = 400;
    throw err;
  }

  const ext = extByType[file.type] || path.extname(file.name || "") || ".img";
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(dir, { recursive: true });
  const diskName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  await writeFile(path.join(dir, diskName), Buffer.from(await file.arrayBuffer()));

  return {
    image_path: `/uploads/${folder}/${diskName}`,
    image_name: file.name || diskName,
    image_size_bytes: file.size,
    image_mime_type: file.type,
  } satisfies RegistrationImageUpload;
}

export async function fileExistsUnderPublic(filePath?: string | null) {
  if (!filePath || !filePath.startsWith("/uploads/")) return false;
  const publicRoot = path.join(process.cwd(), "public");
  const fullPath = path.normalize(path.join(publicRoot, filePath));
  if (!fullPath.startsWith(publicRoot)) return false;
  try {
    const s = await stat(fullPath);
    return s.isFile();
  } catch {
    return false;
  }
}
