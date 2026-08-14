const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

// RFC 1918 + link-local ranges, checked against the parsed hostname.
const PRIVATE_IPV4 = /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;

export interface MobilePreviewUrlResult {
  ok: boolean;
  url: string | null;
  isLocalOrPrivate: boolean;
  error: string | null;
}

export function validateMobilePreviewUrl(input: string): MobilePreviewUrlResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, url: null, isLocalOrPrivate: false, error: "Enter a URL." };
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, url: null, isLocalOrPrivate: false, error: "That doesn't look like a valid URL." };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, url: null, isLocalOrPrivate: false, error: `"${parsed.protocol}" URLs aren't allowed.` };
  }

  const isLocalOrPrivate =
    LOOPBACK_HOSTS.has(parsed.hostname) ||
    parsed.hostname.endsWith(".local") ||
    PRIVATE_IPV4.test(parsed.hostname);

  return { ok: true, url: parsed.toString(), isLocalOrPrivate, error: null };
}
