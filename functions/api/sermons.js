const DEFAULT_CHANNEL_URL = "https://www.youtube.com/@SaigonMissionChurch";

const DEFAULTS = {
  maxItems: 60,
  sermonKeywords: ["주일예배설교", "주일 예배 설교", "주일예배", "주일 예배", "예배설교", "말씀"],
  seniorPastorKeywords: ["장재식", "담임목사"],
  excludeKeywords: ["유아세례", "세례식", "특강", "세미나", "간증", "찬양", "기도회", "선교소식", "광고"],
  removeEnglishChurchNames: ["Saigon Mission Church", "Saigom Mission Church", "Siaogon Mission Church"]
};

function parseList(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function squash(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function extractText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.simpleText) return value.simpleText;
  if (Array.isArray(value.runs)) {
    return value.runs.map((run) => run.text || "").join("").trim();
  }
  return "";
}

function includesAny(text, words) {
  if (!words.length) return true;
  return words.some((word) => text.includes(word));
}

function cleanTitle(title, removeEnglishChurchNames) {
  let next = decodeXmlEntities(String(title || ""));

  for (const phrase of removeEnglishChurchNames) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "gi"), "");
  }

  next = next.replace(/Saig\w*\s+Mission\s+Church/gi, "");
  next = next.replace(/사이공\s*선교\s*교회|사이공선교교회|사이공선교회/g, "");

  return squash(
    next
      .replace(/\s*\/\s*\//g, " /")
      .replace(/\|\s*\|/g, "|")
      .replace(/\s{2,}/g, " ")
      .replace(/^[-|/\s]+|[-|/\s]+$/g, "")
  );
}

function sanitizeDescription(text) {
  return squash(
    String(text || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/#\S+/g, "")
      .replace(/This stream is created with #PRISMLiveStudio/gi, "")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[\/|]+/g, " ")
      .replace(/[|]+/g, " ")
  );
}

function isMetadataHeavy(text) {
  const s = squash(String(text || ""));
  if (!s) return true;
  const hits = ["목사", "주일", "예배", "설교", "사이공", "교회"].filter((k) => s.includes(k)).length;
  const plainWords = s.split(/\s+/).filter(Boolean).length;
  return hits >= 3 && plainWords <= 16;
}

function decodeXmlEntities(text) {
  return String(text || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#10;", " ");
}

function looksLikeDateTitle(title) {
  const t = squash(String(title || "").replace(/["'“”‘’]/g, ""));
  if (!t) return true;
  if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(t)) return true;
  if (/^\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일$/.test(t)) return true;
  return false;
}

function extractTitleFromDescription(description) {
  const d = decodeXmlEntities(String(description || ""));
  if (!d) return "";
  const parts = d
    .split("/")
    .map((p) => squash(p))
    .filter(Boolean);

  if (!parts.length) return "";

  const banned = ["주일예배", "주일 예배", "설교", "장재식", "목사", "사이공", "교회", "202", "20"];
  const picked = parts.find((p) => !banned.some((kw) => p.includes(kw))) || parts[0];
  return picked.replace(/["'“”‘’]/g, "").trim();
}

function buildTranscriptSummary(transcriptText, title) {
  const cleaned = sanitizeDescription(transcriptText)
    .replace(/\b(음|어|저기|그냥|이제)\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Prefer 2-3 natural Korean sentences from transcript text.
  const sentences = cleaned
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 18 && !/^\d+[.)]/.test(s));

  if (sentences.length >= 2) {
    const picked = [];
    for (const sentence of sentences) {
      picked.push(sentence);
      if (picked.length >= 3) break;
    }
    const summary = picked.join(" ");
    return summary.length > 320 ? `${summary.slice(0, 320)}...` : summary;
  }

  if (cleaned.length < 120) {
    const firstPart = cleanTitle(squash((title || "").split("/")[0].replace(/["']/g, "")), []);
    if (cleaned.length >= 40 && !isMetadataHeavy(cleaned)) {
      return cleaned.length > 220 ? `${cleaned.slice(0, 220)}...` : cleaned;
    }
    if (firstPart) {
      return `${firstPart} 말씀을 중심으로 신앙의 본질을 돌아보는 주일 설교입니다. 일상에서 믿음을 적용하도록 도전하고 위로를 전합니다.`;
    }
    return "주일 설교의 핵심 메시지를 전하며, 삶 속에서 복음을 실천하도록 돕는 말씀입니다.";
  }

  const parts = cleaned
    .split(/(?:\.|\!|\?|\n|\r|다\.)\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 20);

  if (parts.length === 0) {
    return cleaned.slice(0, 220);
  }

  const selected = [];
  for (const part of parts) {
    selected.push(part);
    if (selected.length >= 3) break;
  }

  const summary = selected.join(". ");
  return summary.length > 260 ? `${summary.slice(0, 260)}...` : summary;
}

function makeSummary(item) {
  return buildTranscriptSummary(item.transcript || item.description || "", item.title || "");
}

function isSeniorPastorSermon(item, options) {
  const text = squash(`${item.title} ${item.description || ""}`);

  if (!includesAny(text, options.sermonKeywords)) return false;
  if (!includesAny(text, options.seniorPastorKeywords)) return false;
  if (options.excludeKeywords.some((word) => text.includes(word))) return false;

  const pastorMatches = [...text.matchAll(/([가-힣]{2,4})\s*목사/g)].map((m) => m[1]);
  if (pastorMatches.length) {
    const hasSenior = pastorMatches.some((name) =>
      options.seniorPastorKeywords.some((k) => name.includes(k) || k.includes(name))
    );
    if (!hasSenior) return false;
  }

  return true;
}

function collectVideoCandidates(node, out = []) {
  if (!node || typeof node !== "object") return out;

  if (node.videoId && node.title) {
    const title = extractText(node.title);
    const publishedText = extractText(node.publishedTimeText);
    const description =
      extractText(node.descriptionSnippet) ||
      extractText(node.detailedMetadataSnippets?.[0]?.snippetText) ||
      extractText(node.description);

    if (title) {
      out.push({
        title,
        videoId: node.videoId,
        url: `https://www.youtube.com/watch?v=${node.videoId}`,
        publishedAt: "",
        publishedText,
        description
      });
    }
  }

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectVideoCandidates(item, out));
    } else if (value && typeof value === "object") {
      collectVideoCandidates(value, out);
    }
  }

  return out;
}

function parseDateParts(text) {
  const s = String(text || "");
  const m = s.match(/\b(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\b/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return null;
  return { y, mo, d };
}

function makeDateKey(item) {
  const byTitle = parseDateParts(item.title);
  if (byTitle) {
    return `${byTitle.y}-${String(byTitle.mo).padStart(2, "0")}-${String(byTitle.d).padStart(2, "0")}`;
  }

  if (item.publishedAt) {
    const dt = new Date(item.publishedAt);
    if (!Number.isNaN(dt.getTime())) {
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    }
  }

  return "";
}

function canonicalSermonTitle(title) {
  return cleanTitle(title, [])
    .replace(/["'“”‘’]/g, "")
    .replace(/\b(주일\s*예배\s*설교|주일\s*예배|주일예배설교|주일예배|예배설교|설교|예배)\b/g, " ")
    .replace(/\b(장재식\s*목사|장재식목사|담임\s*목사|담임목사)\b/g, " ")
    .replace(/[\/|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLikelyLiveItem(item) {
  const text = squash(`${item.title || ""} ${item.description || ""}`).toLowerCase();
  const liveKeywords = ["live", "라이브", "실시간", "stream", "스트리밍", "prismlivestudio"];
  if (liveKeywords.some((k) => text.includes(k))) return true;

  const published = String(item.publishedText || "").toLowerCase();
  if (published.includes("실시간") || published.includes("streamed") || published.includes("streaming")) {
    return true;
  }

  return false;
}

function itemTimestamp(item) {
  if (item.publishedAt) {
    const dt = new Date(item.publishedAt);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }

  const parts = parseDateParts(item.title) || parseDateParts(item.publishedText);
  if (parts) {
    return Date.UTC(parts.y, parts.mo - 1, parts.d);
  }

  return 0;
}

function normalize(items, options) {
  const unique = new Map();
  for (const item of items) {
    if (!item || !item.videoId || !item.title) continue;
    if (!unique.has(item.videoId)) unique.set(item.videoId, item);
  }

  const filtered = [...unique.values()]
    .filter((item) => !isLikelyLiveItem(item))
    .filter((item) => isSeniorPastorSermon(item, options));

  const sorted = filtered.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));

  const deduped = [];
  const seenSermonKeys = new Set();

  for (const item of sorted) {
    const keyTitle = canonicalSermonTitle(item.title);
    const keyDate = makeDateKey(item);
    const sermonKey = `${keyTitle}|${keyDate}`;
    if (seenSermonKeys.has(sermonKey)) continue;
    seenSermonKeys.add(sermonKey);
    deduped.push(item);
  }

  return deduped
    .map((item) => ({
      ...item,
      title: (() => {
        const cleanedTitle = cleanTitle(item.title, options.removeEnglishChurchNames);
        if (!looksLikeDateTitle(cleanedTitle)) return cleanedTitle;
        const fromDescription = extractTitleFromDescription(item.description);
        if (!fromDescription) return cleanedTitle;
        return cleanTitle(fromDescription, options.removeEnglishChurchNames);
      })(),
      description: decodeXmlEntities(item.description || ""),
      publishedText: decodeXmlEntities(item.publishedText || ""),
      thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
      thumbnailHigh: `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`,
      thumbnailFallback: `https://i.ytimg.com/vi/${item.videoId}/sddefault.jpg`
    }))
    .slice(0, options.maxItems)
    .map((item) => ({
      ...item,
      summary: makeSummary(item)
    }));
}

async function fetchVideoDescription(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });

  if (!response.ok) return "";

  const html = await response.text();
  const match = html.match(/"shortDescription":"([\s\S]*?)","isCrawlable"/);
  if (!match) return "";

  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return "";
  }
}

function parsePlayerResponseFromHtml(html) {
  const matched =
    html.match(/var ytInitialPlayerResponse = (\{[\s\S]*?\});/) ||
    html.match(/"ytInitialPlayerResponse"\s*:\s*(\{[\s\S]*?\})\s*[,<]/);
  if (!matched) return null;

  try {
    return JSON.parse(matched[1]);
  } catch {
    return null;
  }
}

function pickCaptionTrack(captionTracks = []) {
  if (!captionTracks.length) return null;
  return (
    captionTracks.find((t) => t.languageCode === "ko") ||
    captionTracks.find((t) => t.languageCode?.startsWith("ko")) ||
    captionTracks.find((t) => t.kind === "asr" && t.languageCode?.startsWith("ko")) ||
    captionTracks[0]
  );
}

async function fetchTranscriptByVideoId(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const watchRes = await fetch(watchUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!watchRes.ok) return "";

  const html = await watchRes.text();
  const playerResponse = parsePlayerResponseFromHtml(html);
  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const chosenTrack = pickCaptionTrack(captionTracks);
  if (!chosenTrack?.baseUrl) {
    // Fallback to direct timedtext endpoint (Google/YouTube caption API).
    const directUrl = `https://www.youtube.com/api/timedtext?lang=ko&v=${videoId}`;
    const directRes = await fetch(directUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });

    if (!directRes.ok) return "";
    const directXml = await directRes.text();
    const directLines = [...directXml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeXmlEntities(m[1]));
    return squash(directLines.join(" "));
  }

  // Prefer json3 transcript format for robust parsing.
  const json3Url = `${chosenTrack.baseUrl}&fmt=json3`;
  const transcriptRes = await fetch(json3Url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });

  if (transcriptRes.ok) {
    try {
      const data = await transcriptRes.json();
      const text = (data?.events || [])
        .flatMap((ev) => ev.segs || [])
        .map((seg) => seg.utf8 || "")
        .join(" ");
      const cleaned = squash(decodeXmlEntities(text));
      if (cleaned.length > 0) return cleaned;
    } catch {
      // Fallback to XML parsing below.
    }
  }

  const xmlRes = await fetch(chosenTrack.baseUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });
  if (!xmlRes.ok) return "";

  const xml = await xmlRes.text();
  const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeXmlEntities(m[1]));
  return squash(lines.join(" "));
}

async function enrichDescriptions(items) {
  const limit = 12;
  const target = items.slice(0, limit);

  const enriched = await Promise.all(
    target.map(async (item) => {
      const transcript = await fetchTranscriptByVideoId(item.videoId);
      const fetchedDescription = sanitizeDescription(item.description || "").length >= 40
        ? item.description
        : await fetchVideoDescription(item.videoId);

      return {
        ...item,
        transcript,
        description: fetchedDescription || item.description || ""
      };
    })
  );

  return [...enriched, ...items.slice(limit)].map((item) => {
    const merged = {
      ...item,
      title: cleanTitle(item.title || "", DEFAULTS.removeEnglishChurchNames),
      description: decodeXmlEntities(item.description || "")
    };
    return {
      ...merged,
      summary: makeSummary(merged)
    };
  });
}

async function fetchByRss(channelId) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const response = await fetch(feedUrl, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) return [];

  const xml = await response.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);

  return entries
    .map((entryXml) => {
      const getTag = (tag) => {
        const match = entryXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
        return match ? match[1].trim() : "";
      };

      const title = getTag("title");
      const videoId = getTag("yt:videoId");
      const publishedAt = getTag("published");
      const description = getTag("media:description");
      if (!title || !videoId) return null;

      return {
        title,
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt,
        publishedText: "",
        description
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function fetchByVideosPage(channelUrl) {
  const videosUrl = `${channelUrl.replace(/\/$/, "")}/videos`;
  const response = await fetch(videosUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });

  if (!response.ok) {
    throw new Error(`videos 페이지를 불러오지 못했습니다: HTTP ${response.status}`);
  }

  const html = await response.text();
  const match =
    html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/) ||
    html.match(/window\["ytInitialData"\] = (\{[\s\S]*?\});/);

  if (!match) throw new Error("ytInitialData를 찾지 못했습니다.");

  return collectVideoCandidates(JSON.parse(match[1]));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=1800"
    }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const maxItems = Math.min(Math.max(Number(url.searchParams.get("limit") || env.SERMON_MAX_ITEMS || DEFAULTS.maxItems), 1), 100);
  const channelId = env.YOUTUBE_CHANNEL_ID || "UC6oE7oR7nI1Ac9mUb40UFnw";
  const channelHandleUrl = env.YOUTUBE_CHANNEL_URL || DEFAULT_CHANNEL_URL;

  const options = {
    maxItems,
    sermonKeywords: parseList(env.SERMON_KEYWORDS, DEFAULTS.sermonKeywords),
    seniorPastorKeywords: parseList(env.SENIOR_PASTOR_KEYWORDS, DEFAULTS.seniorPastorKeywords),
    excludeKeywords: parseList(env.EXCLUDE_KEYWORDS, DEFAULTS.excludeKeywords),
    removeEnglishChurchNames: parseList(env.REMOVE_ENGLISH_CHURCH_NAMES, DEFAULTS.removeEnglishChurchNames)
  };

  try {
    let rssItems = [];
    let videosItems = [];

    try {
      rssItems = await fetchByRss(channelId);
    } catch {
      rssItems = [];
    }

    try {
      videosItems = await fetchByVideosPage(channelHandleUrl);
    } catch {
      videosItems = [];
    }

    const mergedSourceItems = [...rssItems, ...videosItems];
    let items = normalize(mergedSourceItems, options);

    items = await enrichDescriptions(items);

    return json({
      items,
      source: items.length ? "worker" : "empty",
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return json(
      {
        items: [],
        source: "error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      500
    );
  }
}
