import type { Attachment } from "@/state/store";

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageMime(mimeType?: string): boolean {
  return Boolean(mimeType && mimeType.startsWith("image/"));
}

export function isImageAttachment(att: Attachment): boolean {
  if (isImageMime(att.mimeType)) return true;
  const lower = att.name.toLowerCase();
  return /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/.test(lower);
}

export function isTextFile(name: string, mimeType?: string): boolean {
  if (mimeType && (mimeType.startsWith("text/") || mimeType.includes("json") || mimeType.includes("javascript") || mimeType.includes("xml"))) {
    return true;
  }
  const lower = name.toLowerCase();
  return /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|html|xml|yaml|yml|sh|bash|zsh|py|rb|go|rs|c|cpp|h|hpp|java|kt|swift|sql|csv|tsv|env|gitignore)$/.test(lower);
}

export async function readFileAsAttachment(file: File): Promise<Attachment> {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const mimeType = file.type || (isTextFile(file.name) ? "text/plain" : "application/octet-stream");

  // Read data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  let textContent: string | undefined;
  if (isTextFile(file.name, file.type) && file.size < 1024 * 1024) {
    try {
      textContent = await file.text();
    } catch {}
  }

  return {
    id,
    name: file.name,
    mimeType,
    size: file.size,
    dataUrl,
    textContent,
  };
}
