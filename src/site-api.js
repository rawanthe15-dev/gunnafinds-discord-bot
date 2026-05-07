function headers(botApiToken) {
  const next = { accept: "application/json" };
  if (botApiToken) next.authorization = `Bearer ${botApiToken}`;
  return next;
}

async function fetchJson(url, { botApiToken, timeoutMs = 10_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Site API timed out")), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      headers: headers(botApiToken),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Site API returned ${response.status}`);
  return response.json();
}

export async function fetchAnnouncements(announcementsApiUrl, options = {}) {
  const data = await fetchJson(announcementsApiUrl, options);
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchCatalogSnapshot(catalogApiUrl, options = {}) {
  const url = new URL(catalogApiUrl);
  url.searchParams.set("sort", "recent");
  url.searchParams.set("pageSize", "1");
  const data = await fetchJson(url, options);
  return {
    total: Number.isFinite(data.total) ? data.total : 0,
    newestProductId: typeof data.items?.[0]?.id === "string" ? data.items[0].id : null,
  };
}

function catalogProductToFeedItem(product, siteUrl) {
  const origin = siteUrl.replace(/\/+$/, "");
  const usd =
    typeof product.priceUsdHint === "number"
      ? `$${product.priceUsdHint.toFixed(2)}`
      : null;
  const cny =
    typeof product.priceCnyHint === "number"
      ? `${Math.round(product.priceCnyHint)} CNY`
      : null;
  const price = [cny, usd].filter(Boolean).join(" / ") || null;
  return {
    id: product.id,
    name: product.name,
    image: product.image,
    price,
    productUrl: `${origin}/p/${encodeURIComponent(product.id)}`,
    agentLinks: [],
    reason: "Catalog pick",
  };
}

export async function fetchFindFeed({
  feedApiUrl,
  catalogApiUrl,
  siteUrl,
  excludeIds = [],
  page = 1,
  limit = 12,
  botApiToken,
}) {
  if (feedApiUrl) {
    try {
      const url = new URL(feedApiUrl);
      url.searchParams.set("limit", String(limit));
      if (excludeIds.length) url.searchParams.set("exclude", excludeIds.slice(0, 80).join(","));
      const data = await fetchJson(url, { botApiToken });
      if (Array.isArray(data.items)) return data.items;
    } catch (error) {
      console.warn("Feed API unavailable, falling back to catalog:", error.message);
    }
  }

  const url = new URL(catalogApiUrl);
  url.searchParams.set("sort", "priced");
  url.searchParams.set("withQc", "1");
  url.searchParams.set("pageSize", String(Math.max(limit, 24)));
  url.searchParams.set("page", String(page));
  const data = await fetchJson(url, { botApiToken });
  const blocked = new Set(excludeIds);
  return (data.items ?? [])
    .filter((product) => product?.id && !blocked.has(product.id))
    .map((product) => catalogProductToFeedItem(product, siteUrl));
}
