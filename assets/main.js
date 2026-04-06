const sermonList = document.getElementById("sermon-list");
const loadMoreBtn = document.getElementById("load-more-sermons");
const scrollProgress = document.querySelector(".scroll-progress span");
const PAGE_SIZE = 10;

let sermonItems = [];
let visibleCount = 0;

function formatDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "";
  const pad2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

function extractFirstDate(text) {
  const s = String(text || "");

  // 2026.4.5 / 2026.04.05 / 2026/4/5
  const dot = s.match(/\b(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})\b/);
  if (dot) {
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${dot[1]}.${pad2(dot[2])}.${pad2(dot[3])}`;
  }

  // 2026년 3월 15일
  const kor = s.match(/\b(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\b/);
  if (kor) {
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${kor[1]}.${pad2(kor[2])}.${pad2(kor[3])}`;
  }

  // 260405 (yyMMdd)
  const compact = s.match(/\b(\d{2})(\d{2})(\d{2})\b/);
  if (compact) {
    return `20${compact[1]}.${compact[2]}.${compact[3]}`;
  }

  return "";
}

function extractBibleRef(text) {
  const s = String(text || "");
  // Examples: 요 3:16, 요한복음 3:16-18, 창세기 1:1
  const m = s.match(/(?:[가-힣]{1,8}(?:서|기|복음|전서|후서)?\s*)?\b(\d{1,3})\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?/);
  if (!m) return "";
  // Keep as-is slice to preserve any book name nearby if present
  return m[0].replace(/\s+/g, " ").trim();
}

function looksLikeDateOnlyTitle(text) {
  const s = String(text || "").trim();
  return /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(s)
    || /^\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일$/.test(s);
}

function titleFromDescription(description) {
  const parts = String(description || "")
    .split("/")
    .map((p) => cleanDisplayTitle(p))
    .filter(Boolean);
  return parts[0] || "";
}

function cleanDisplayTitle(title) {
  return decodeHtmlEntities(String(title || ""))
    .replace(/Saig\w*\s+Mission\s+Church/gi, "")
    .replace(/사이공\s*선교\s*교회|사이공선교교회|사이공선교회/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-|/\s]+|[-|/\s]+$/g, "")
    .trim();
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSummary(item) {
  if (item.summary) return decodeHtmlEntities(item.summary);

  const titleLead = cleanDisplayTitle(item.title).split("/")[0].replace(/["']/g, "").trim();
  if (titleLead) {
    return `${titleLead} 말씀을 중심으로 한 설교입니다.`;
  }

  return "주일 설교 말씀 요약입니다.";
}

function attachThumbnailFallback() {
  const images = sermonList.querySelectorAll("img[data-video-id]");
  images.forEach((img) => {
    if (img.dataset.fallbackBound !== "true") {
      img.dataset.fallbackBound = "true";

      img.addEventListener("error", () => {
      const tried = img.dataset.tried || "hq";
      const videoId = img.dataset.videoId;
      if (!videoId) return;

      if (tried === "maxres") {
        img.dataset.tried = "mq";
        img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        return;
      }

      if (tried === "mq") {
        img.dataset.tried = "sd";
        img.src = `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
        return;
      }

      if (tried === "hq") {
        img.dataset.tried = "sd";
        img.src = `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
        return;
      }

      if (tried === "sd") {
        img.dataset.tried = "hq";
        img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        return;
      }

      img.src = "assets/images/blog.png";
      });
    }

    if (img.dataset.upgraded === "true") return;
    img.dataset.upgraded = "true";

    const videoId = img.dataset.videoId;
    if (!videoId) return;

    const probe = new Image();
    probe.onload = () => {
      img.dataset.tried = "maxres";
      img.src = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    };
    probe.src = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  });
}

function updateLoadMoreState() {
  if (!loadMoreBtn) return;
  if (visibleCount >= sermonItems.length) {
    loadMoreBtn.hidden = true;
    return;
  }
  loadMoreBtn.hidden = false;
  loadMoreBtn.textContent = `지난 설교 더 보기`;
}

function formatSermonTitle(rawTitle, dateText, description = "") {
  const s = decodeHtmlEntities(String(rawTitle || "")).replace(/["']/g, "").trim();
  const parts = s.split("/").map((p) => p.trim()).filter(Boolean);
  const candidateTitle = parts[0] || cleanDisplayTitle(s);
  const normalizedTitle = looksLikeDateOnlyTitle(candidateTitle)
    ? (titleFromDescription(description) || candidateTitle)
    : candidateTitle;
  const title = normalizedTitle || "주일예배 설교";
  let pastor = parts.find((p) => p.includes("목사")) || "";
  if (pastor && !pastor.includes(" 목사") && pastor.includes("목사")) {
    pastor = pastor.replace("목사", " 목사");
  }

  const occasion = parts.find((p) => p.includes("예배") || p.includes("설교")) || "";
  const bible = extractBibleRef(s);
  const scriptureOrOccasion = bible || occasion || "";

  const dateFromTitle = extractFirstDate(s);
  const dateFromFallback = extractFirstDate(dateText) || "";
  const dt = dateFromTitle || dateFromFallback;

  const meta = [];
  if (pastor) meta.push(pastor);
  if (dt) meta.push(dt);

  return {
    title,
    scripture: scriptureOrOccasion,
    meta: meta.join(" · ")
  };
}

function renderNextPage() {
  if (!sermonList) return;

  const nextItems = sermonItems.slice(visibleCount, visibleCount + PAGE_SIZE);
  if (!nextItems.length) {
    updateLoadMoreState();
    return;
  }

  const html = nextItems
    .map((item) => {
      const dateText = formatDate(item.publishedAt) || item.publishedText || "";
      const parsed = formatSermonTitle(item.title, dateText, item.description || "");
      const titleText = escapeHtml(parsed.title);
      const scriptureText = escapeHtml(parsed.scripture);
      const metaText = escapeHtml(parsed.meta);
      
      return `
        <article class="video-card reveal">
          <a class="thumb-link" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" aria-label="${titleText} 영상 보기">
            <img
              class="video-thumb"
              src="${escapeHtml(item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`)}"
              alt="${titleText} 썸네일"
              loading="lazy"
              referrerpolicy="no-referrer"
              data-video-id="${escapeHtml(item.videoId)}"
              data-tried="hq"
            />
          </a>
          <div class="video-meta">
            ${scriptureText ? `<p class="section-kicker" style="margin:0 0 0.35rem;">${scriptureText}</p>` : ``}
            <h3>${titleText}</h3>
            ${metaText ? `<p class="sermon-meta">${metaText}</p>` : ``}
          </div>
        </article>
      `;
    })
    .join("");

  sermonList.insertAdjacentHTML("beforeend", html);
  visibleCount += nextItems.length;

  attachThumbnailFallback();
  observeReveal();
  updateLoadMoreState();
}

async function renderSermons() {
  if (!sermonList) return;

  try {
    let items = [];

    try {
      const apiRes = await fetch("/api/sermons?limit=60", { cache: "no-store" });
      if (!apiRes.ok) throw new Error(`API HTTP ${apiRes.status}`);
      const apiData = await apiRes.json();
      items = Array.isArray(apiData?.items) ? apiData.items : [];
    } catch (apiErr) {
      console.warn("Workers API fetch failed, fallback to static JSON", apiErr);
      const res = await fetch("data/sermons.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
      const fallbackItems = await res.json();
      items = Array.isArray(fallbackItems) ? fallbackItems : [];
    }

    if (!Array.isArray(items) || items.length === 0) {
      sermonList.innerHTML = "<p>등록된 설교 영상이 없습니다.</p>";
      if (loadMoreBtn) loadMoreBtn.hidden = true;
      return;
    }

    sermonItems = items;
    visibleCount = 0;
    sermonList.innerHTML = "";
    renderNextPage();

    if (loadMoreBtn) {
      loadMoreBtn.onclick = renderNextPage;
    }
  } catch (err) {
    console.error(err);
    sermonList.innerHTML = "<p>설교 영상을 불러오는 중 문제가 발생했습니다.</p>";
    if (loadMoreBtn) loadMoreBtn.hidden = true;
  }
}

function observeReveal() {
  const revealItems = document.querySelectorAll(".reveal");
  if (!revealItems.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealItems.forEach((el, index) => {
    el.style.transitionDelay = `${Math.min(index * 60, 280)}ms`;
    observer.observe(el);
  });
}

function updateScrollProgress() {
  if (!scrollProgress) return;
  const doc = document.documentElement;
  const maxScroll = doc.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? Math.min(Math.max(window.scrollY / maxScroll, 0), 1) : 0;
  scrollProgress.style.transform = `scaleX(${progress})`;
}

const topNav = document.querySelector(".top-nav");
function updateStickyHeader() {
  if (!topNav) return;
  if (window.scrollY > 50) {
    topNav.classList.add("scrolled");
  } else {
    topNav.classList.remove("scrolled");
  }
}

renderSermons();
observeReveal();
updateScrollProgress();
updateStickyHeader();

const yearEl = document.getElementById("current-year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

window.addEventListener("scroll", () => {
  updateScrollProgress();
  updateStickyHeader();
}, { passive: true });
window.addEventListener("resize", updateScrollProgress);
