/**
 * Legacy emoji → pictogram name mapping (data migration only).
 * New code never writes emoji: profiles store icon names (src/components/icons.tsx).
 */
export const AVATAR_ICON_MAP: Record<string, string> = {
  "🧑‍🎓": "graduation-cap",
  "👩‍🎓": "graduation-cap",
  "👦": "user",
  "👧": "user",
  "🧑": "user",
  "👩": "user",
  "👨": "user",
  "🦸": "sparkles",
  "🐱": "cat",
  "🦊": "wand",
  "🐼": "leaf",
  "🦉": "clock",
  "👤": "user",
  "👩‍🦰": "heart-handshake",
  "🧔": "laptop",
};

/** Generic emoji detector used by the client registry for legacy fallbacks. */
export const LEGACY_EMOJI_RE =
  /[\u2190-\u2BFF\uFE0F]|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
