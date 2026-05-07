export async function findProducts(
  findApiUrl,
  query,
  { limit = 5, qcOnly = true, botApiToken, signal } = {},
) {
  const url = new URL(findApiUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("qc", qcOnly ? "1" : "0");

  const controller = signal ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(new Error("Find API timed out")), 8_000)
    : null;
  const headers = { accept: "application/json" };
  if (botApiToken) headers.authorization = `Bearer ${botApiToken}`;

  let response;
  try {
    response = await fetch(url, {
      headers,
      signal: signal ?? controller?.signal,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Find API returned ${response.status}`);
  }

  return response.json();
}
