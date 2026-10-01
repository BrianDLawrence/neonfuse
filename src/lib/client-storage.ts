export const VISITOR_STORAGE_KEY = "neon-fuse:visitor-id";
export const MUSIC_TRACK_STORAGE_KEY = "neon-fuse:music-track";

export function clearNeonFuseClientStorage() {
  try {
    window.localStorage.removeItem(VISITOR_STORAGE_KEY);
    window.localStorage.removeItem(MUSIC_TRACK_STORAGE_KEY);
    document.cookie = "nf_vid=; Max-Age=0; Path=/; SameSite=Lax";
  } catch {
    // Server-side deletion remains authoritative when browser storage is unavailable.
  }
}
