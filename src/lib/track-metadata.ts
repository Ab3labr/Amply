export type MetadataConfidence = "high" | "medium" | "low";

export interface TrackMetadata {
  title: string;
  artist: string | null;
  confidence: MetadataConfidence;
  rawTitle: string;
}

const PROMO_TOKENS = new Set([
  "official",
  "music",
  "video",
  "audio",
  "lyric",
  "lyrics",
  "visualizer",
  "visualiser",
  "4k",
  "8k",
  "hd",
  "hq",
  "mv",
  "m/v",
  "remaster",
  "remastered",
  "explicit",
  "clean",
  "color",
  "coded",
  "performance",
  "dance",
  "practice",
  "full",
]);

const PROMO_BRACKET_RE = /[\(\[]([^\)\]]*)[\)\]]/g;
const SEPARATOR_RE = /\s*(?:\||•|·|—|–)\s*|\s+-\s+/;
const TRAILING_PROMO_RE =
  /\s+(?:official\s+(?:music\s+)?video|official\s+lyric\s+video|official\s+visuali[sz]er|official\s+audio|official\s+video|lyric\s+video|music\s+video|visuali[sz]er|lyrics?|audio|4k|8k|hd|hq|m\/v|mv)\s*$/i;

const TITLE_INDICATOR_RE =
  /\b(remix|mix|edit|version|live|acoustic|instrumental|acapella|a\s+cappella|extended|cover|reprise|intro|interlude|pt\.?|part|slowed|sped\s+up|nightcore|bootleg|demo|radio\s+edit|original\s+mix|club\s+mix|reverb)\b/i;

const PERSON_NAME_RE =
  /^[A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*){1,3}$/;

const FEATURED_RE =
  /^(.*?)\s*[\(\[]?\s*(?:feat\.?|ft\.?|featuring)\s+([^\)\]]+?)\s*[\)\]]?\s*$/i;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isPromoText(value: string): boolean {
  const cleaned = value
    .toLowerCase()
    .replace(/[\[\]\(\)\{\}]/g, " ")
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return false;
  if (cleaned === "m/v" || cleaned === "mv") return true;

  const tokens = cleaned.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => PROMO_TOKENS.has(token));
}

function stripPromoText(value: string): string {
  let result = value.replace(PROMO_BRACKET_RE, (match, inner: string) =>
    isPromoText(inner) ? " " : match
  );

  result = normalize(result);

  for (let i = 0; i < 4; i += 1) {
    const next = result.replace(TRAILING_PROMO_RE, "").trim();
    if (next === result) break;
    result = next;
  }

  return result
    .replace(/^[\s\-–—|•·]+|[\s\-–—|•·]+$/g, "")
    .trim();
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function isAllCaps(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, "");
  return letters.length > 1 && letters === letters.toUpperCase();
}

function artistScore(value: string, other: string): number {
  let score = 0;

  if (/\b(?:feat\.?|ft\.?|featuring)\b/i.test(value)) score += 3;
  if (value.includes(",")) score += 3;
  if (/[&+]/.test(value)) score += 3;
  if (/\s(?:x|vs\.?|and)\s/i.test(value)) score += 2;
  if (/[A-Za-z]\s*\/\s*[A-Za-z]/.test(value)) score += 1;

  if (
    PERSON_NAME_RE.test(value) &&
    !isAllCaps(value) &&
    wordCount(value) <= 4
  ) {
    score += 3;
  }

  if (wordCount(value) === 1 && wordCount(other) >= 2) score += 2;

  if (TITLE_INDICATOR_RE.test(value)) score -= 3;
  if (/[.?!]$/.test(value)) score -= 2;
  if (value.length > other.length + 12) score -= 1;

  return score;
}

function confidenceFor(score: number, difference: number): MetadataConfidence {
  if (difference >= 2 && score >= 3) return "high";
  if (difference >= 2) return "medium";
  return "low";
}

function extractFeatured(
  title: string,
  artist: string | null
): { title: string; artist: string | null } {
  const match = title.match(FEATURED_RE);
  if (!match) return { title, artist };

  const baseTitle = match[1].trim();
  const featured = match[2].trim();
  if (!baseTitle || !featured) return { title, artist };

  return {
    title: baseTitle,
    artist: artist ? `${artist} feat. ${featured}` : featured,
  };
}

function classifySides(
  left: string,
  right: string,
  rawTitle: string
): TrackMetadata {
  const leftScore = artistScore(left, right);
  const rightScore = artistScore(right, left);
  const difference = Math.abs(leftScore - rightScore);

  if (difference >= 2) {
    const artistIsLeft = leftScore > rightScore;
    const score = Math.max(leftScore, rightScore);
    const parsed = extractFeatured(
      artistIsLeft ? right : left,
      artistIsLeft ? left : right
    );
    return {
      title: parsed.title,
      artist: parsed.artist,
      confidence: confidenceFor(score, difference),
      rawTitle,
    };
  }

  if (leftScore >= 3 && rightScore >= 3) {
    return {
      title: rawTitle,
      artist: null,
      confidence: "low",
      rawTitle,
    };
  }

  if (left.length > right.length + 10 && wordCount(right) <= 4) {
    const parsed = extractFeatured(left, right);
    return {
      title: parsed.title,
      artist: parsed.artist,
      confidence: "medium",
      rawTitle,
    };
  }

  if (right.length > left.length + 10 && wordCount(left) <= 4) {
    const parsed = extractFeatured(right, left);
    return {
      title: parsed.title,
      artist: parsed.artist,
      confidence: "medium",
      rawTitle,
    };
  }

  const parsed = extractFeatured(right, left);
  return {
    title: parsed.title,
    artist: parsed.artist,
    confidence: "medium",
    rawTitle,
  };
}

export function parseTrackMetadata(rawTitle: string | null | undefined): TrackMetadata {
  const raw = normalize(decodeEntities(rawTitle ?? ""));

  if (!raw) {
    return { title: "", artist: null, confidence: "low", rawTitle: raw };
  }

  const cleaned = stripPromoText(raw);
  if (!cleaned) {
    return { title: raw, artist: null, confidence: "low", rawTitle: raw };
  }

  const parts = cleaned
    .split(SEPARATOR_RE)
    .map((part) => normalize(part))
    .filter(Boolean)
    .filter((part) => !isPromoText(part));

  if (parts.length === 0) {
    return { title: raw, artist: null, confidence: "low", rawTitle: raw };
  }

  if (parts.length === 1) {
    const parsed = extractFeatured(parts[0], null);
    return {
      title: parsed.title,
      artist: parsed.artist,
      confidence: parsed.artist ? "medium" : "low",
      rawTitle: raw,
    };
  }

  if (parts.length === 2) {
    return classifySides(parts[0], parts[1], cleaned);
  }

  const first = parts[0];
  const last = parts[parts.length - 1];
  const firstScore = artistScore(first, last);
  const lastScore = artistScore(last, first);

  if (lastScore > firstScore + 1) {
    return {
      title: parts.slice(0, -1).join(" - "),
      artist: last,
      confidence: "medium",
      rawTitle: raw,
    };
  }

  return {
    title: parts.slice(1).join(" - "),
    artist: first,
    confidence: firstScore > lastScore + 1 ? "medium" : "low",
    rawTitle: raw,
  };
}

/**
 * Remove a leading channel name from a video title, e.g.
 * `"The Weeknd - Blinding Lights (Official Video)"` + `"The Weeknd"` becomes
 * `"Blinding Lights (Official Video)"`. Used when YouTube search metadata gives
 * us an authoritative channel and the title repeats it.
 */
export function stripChannelPrefix(title: string, channelTitle?: string | null): string {
  const channel = (channelTitle ?? "").trim();
  if (!channel) return title;

  const escaped = channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^\\s*${escaped}\\s*[-–—:·|]\\s*`, "i");
  const stripped = title.replace(prefix, "").trim();
  return stripped || title;
}
