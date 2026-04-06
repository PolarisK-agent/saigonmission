function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Fast edge cache for API responses.
      "Cache-Control": "public, max-age=300, s-maxage=1800"
    }
  });
}

function clampLimit(value, fallback = 24) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), 100);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit") ?? 24, 24);

  try {
    // Serve only pre-generated cached data. Never scrape YouTube in request path.
    const dataUrl = new URL("/data/sermons.json", url.origin);
    const dataRes = await fetch(dataUrl.toString(), {
      cf: {
        cacheEverything: true,
        cacheTtl: 3600
      }
    });

    if (!dataRes.ok) {
      throw new Error(`sermons.json fetch failed: HTTP ${dataRes.status}`);
    }

    const items = await dataRes.json();
    const list = Array.isArray(items) ? items : [];

    return json({
      items: list.slice(0, limit),
      source: "cache-json",
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
