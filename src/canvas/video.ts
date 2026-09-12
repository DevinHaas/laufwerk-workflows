const PROVIDERS = ["youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com"];

function parsed(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function isDirectVideoUrl(value: string): boolean {
  const url = parsed(value);
  return url?.hostname === "cdn.21st.dev" && /\.(?:mp4|webm)$/i.test(url.pathname);
}

export function isSupportedVideoUrl(value: string): boolean {
  const url = parsed(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return PROVIDERS.includes(host) || isDirectVideoUrl(value);
}
