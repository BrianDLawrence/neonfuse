export const VISITOR_STORAGE_KEY = "neon-fuse:visitor-id";
export const MUSIC_TRACK_STORAGE_KEY = "neon-fuse:music-track";
export const CAMPAIGN_PROGRESS_STORAGE_KEY = "neon-fuse:campaign-progress";
export const DAILY_PROGRESS_STORAGE_KEY = "neon-fuse:daily-progress";
export const SHOW_BLAST_ZONES_STORAGE_KEY = "neon-fuse:show-blast-zones";
export const HOW_TO_PLAY_SEEN_STORAGE_KEY = "neon-fuse:how-to-play-seen";

export function clearNeonFuseClientStorage() {
  try {
    window.localStorage.removeItem(VISITOR_STORAGE_KEY);
    window.localStorage.removeItem(MUSIC_TRACK_STORAGE_KEY);
    window.localStorage.removeItem(CAMPAIGN_PROGRESS_STORAGE_KEY);
    window.localStorage.removeItem(DAILY_PROGRESS_STORAGE_KEY);
    window.localStorage.removeItem(SHOW_BLAST_ZONES_STORAGE_KEY);
    window.localStorage.removeItem(HOW_TO_PLAY_SEEN_STORAGE_KEY);
    document.cookie = "nf_vid=; Max-Age=0; Path=/; SameSite=Lax";
  } catch {
    // Server-side deletion remains authoritative when browser storage is unavailable.
  }
}

/** The "Show blast zones" setting: off unless this device turned it on. */
export function readShowBlastZones(): boolean {
  try {
    return window.localStorage.getItem(SHOW_BLAST_ZONES_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeShowBlastZones(show: boolean) {
  try {
    if (show) {
      window.localStorage.setItem(SHOW_BLAST_ZONES_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(SHOW_BLAST_ZONES_STORAGE_KEY);
    }
  } catch {
    // The setting still applies for this visit when browser storage is unavailable.
  }
}

/**
 * Whether this device has already been shown How to play. Reads as seen when
 * browser storage is unavailable, so the guide never reopens on every visit.
 */
export function readHowToPlaySeen(): boolean {
  try {
    return window.localStorage.getItem(HOW_TO_PLAY_SEEN_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function writeHowToPlaySeen() {
  try {
    window.localStorage.setItem(HOW_TO_PLAY_SEEN_STORAGE_KEY, "1");
  } catch {
    // The guide stays reachable from the menu when browser storage is unavailable.
  }
}
