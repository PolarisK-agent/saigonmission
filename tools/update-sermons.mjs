import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const configPath = resolve(root, "data/youtube.config.json");
const outputPath = resolve(root, "data/sermons.json");

const config = JSON.parse(await readFile(configPath, "utf8"));

if (!config.channelId || config.channelId === "REPLACE_WITH_YOUTUBE_CHANNEL_ID") {
  throw new Error("youtube.config.json에 channelId를 실제 값으로 입력해 주세요.");
}

const sermonKeywords = config.sermonKeywords || [];
const seniorPastorKeywords = config.seniorPastorKeywords || [];
const excludeKeywords = config.excludeKeywords || [];
const removeEnglishChurchNames = config.removeEnglishChurchNames || [];

function decodeXmlEntities(text) {
  return String(text || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#10;", " ");
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

function squash(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function cleanTitle(title) {
  let next = decodeXmlEntities(String(title || ""));
  for (const phrase of removeEnglishChurchNames) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "gi"), "");
  }

  // Remove common spelling variants like Saigom/Siaogon/Saigon Mission Church.
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

function makeSummary(item) {
  const description = squash(
    String(item.description || "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/#\S+/g, "")
      .replace(/This stream is created with #PRISMLiveStudio/gi, "")
  );
  const isBoilerplate = /PRISMLiveStudio|stream is created/i.test(description);
  if (description && !isBoilerplate) {
    const chunks = description
      .split(/(?:\.|\n|\r|\!|\?|다\.)\s+/)
      .map((v) => v.trim())
      .filter(Boolean);
    const picked = chunks.slice(0, 3).join(". ") || description;
    return picked.length > 220 ? `${picked.slice(0, 220)}...` : picked;
  }

  const firstPart = cleanTitle(squash((item.title || "").split("/")[0].replace(/["']/g, "")));
  if (firstPart) {
    return `${firstPart} 말씀을 중심으로 은혜를 나누는 주일 설교입니다.`;
  }

  return "주일 설교 말씀 요약 정보입니다.";
}

function includesAny(text, words) {
  if (!words.length) return true;
  return words.some((word) => text.includes(word));
}

function isSeniorPastorSermon(item) {
  const text = squash(`${item.title} ${item.description || ""}`);

  if (!includesAny(text, sermonKeywords)) return false;
  if (!includesAny(text, seniorPastorKeywords)) return false;
  if (excludeKeywords.some((word) => text.includes(word))) return false;

  const pastorMatches = [...text.matchAll(/([가-힣]{2,4})\s*목사/g)].map((m) => m[1]);
  if (pastorMatches.length) {
    const hasSenior = pastorMatches.some((name) => seniorPastorKeywords.some((k) => name.includes(k) || k.includes(name)));
    if (!hasSenior) return false;
  }

  return true;
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
  return cleanTitle(title)
    .replace(/["'“”‘’]/g, "")
    .replace(/\b(주일\s*예배\s*설교|주일\s*예배|주일예배설교|주일예배|예배설교|설교|예배)\b/g, " ")
    .replace(/\b(장재식\s*목사|장재식목사|담임\s*목사|담임목사)\b/g, " ")
    .replace(/[\/|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
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

function collectVideoCandidates(node, out = []) {
  if (!node || typeof node !== "object") return out;

  if (node.videoId && node.title) {
    const title =
      node.title?.runs?.[0]?.text ||
      node.title?.simpleText ||
      "";
    const publishedText = node.publishedTimeText?.simpleText || "";
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

function normalize(items) {
  const unique = new Map();
  for (const item of items) {
    if (!item || !item.videoId || !item.title) continue;
    if (!unique.has(item.videoId)) {
      unique.set(item.videoId, item);
    }
  }

  const filtered = [...unique.values()]
    .filter((item) => !isLikelyLiveItem(item))
    .filter((item) => isSeniorPastorSermon(item));

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
      title: cleanTitle(item.title),
      summary: makeSummary(item),
      thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
      thumbnailHigh: `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`,
      thumbnailFallback: `https://i.ytimg.com/vi/${item.videoId}/sddefault.jpg`
    }))
    .slice(0, Number(config.maxItems) || 60);
}

async function fetchByRss() {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${config.channelId}`;
  const response = await fetch(feedUrl);
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

async function fetchByVideosPage() {
  const channelHandleUrl = config.channelHandleUrl || "https://www.youtube.com/@SaigonMissionChurch";
  const videosUrl = `${channelHandleUrl.replace(/\/$/, "")}/videos`;
  const response = await fetch(videosUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) {
    throw new Error(`videos 페이지를 불러오지 못했습니다: HTTP ${response.status}`);
  }

  const html = await response.text();
  const match =
    html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/) ||
    html.match(/window\["ytInitialData"\] = (\{[\s\S]*?\});/);

  if (!match) {
    throw new Error("ytInitialData를 찾지 못했습니다.");
  }

  const data = JSON.parse(match[1]);
  return collectVideoCandidates(data);
}

let rssItems = [];
let videosItems = [];

try {
  rssItems = await fetchByRss();
} catch {
  rssItems = [];
}

try {
  videosItems = await fetchByVideosPage();
} catch {
  videosItems = [];
}

const parsed = normalize([...rssItems, ...videosItems]);

if (parsed.length === 0) {
  throw new Error("조건에 맞는 영상이 없어 sermons.json을 갱신하지 않았습니다.");
}

await writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
console.log(`sermons.json 업데이트 완료: ${parsed.length}개`);
