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
  let next = title;
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

  return [...unique.values()]
    .filter((item) => isSeniorPastorSermon(item))
    .map((item) => ({
      ...item,
      title: cleanTitle(item.title),
      summary: makeSummary(item),
      thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
      thumbnailHigh: `https://i.ytimg.com/vi/${item.videoId}/maxresdefault.jpg`,
      thumbnailFallback: `https://i.ytimg.com/vi/${item.videoId}/sddefault.jpg`
    }))
    .slice(0, Number(config.maxItems) || 9);
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

let parsed = normalize(await fetchByRss());
if (parsed.length === 0) {
  parsed = normalize(await fetchByVideosPage());
}

if (parsed.length === 0) {
  throw new Error("조건에 맞는 영상이 없어 sermons.json을 갱신하지 않았습니다.");
}

await writeFile(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
console.log(`sermons.json 업데이트 완료: ${parsed.length}개`);
