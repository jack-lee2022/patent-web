/**
 * GET /api/list-reports
 * Lists Markdown reports from the GitHub repo's reports/ directory.
 */

async function fetchReports(token, repo, ref) {
  const resp = await fetch(
    `https://api.github.com/repos/${repo}/contents/reports?ref=${ref}`,
    {
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "patent-web/1.0",
      },
    }
  );
  return resp;
}

export async function onRequestGet(context) {
  const { env } = context;

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || "jack-lee2022/patent_agent";

  if (!token) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    let resp = await fetchReports(token, repo, "main");

    if (!resp.ok) {
      // Fallback to master if main fails
      resp = await fetchReports(token, repo, "master");
      if (!resp.ok) {
        return new Response(
          JSON.stringify({ error: "Cannot fetch reports from GitHub" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const data = await resp.json();

    if (!Array.isArray(data)) {
      return new Response(
        JSON.stringify({ error: "Unexpected response from GitHub" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const reports = data
      .filter((item) => item.type === "file" && item.name.endsWith(".md"))
      .map((item) => ({
        name: item.name,
        path: item.path,
        url: item.html_url,
        download_url: item.download_url,
        size: item.size,
      }))
      .sort((a, b) => b.name.localeCompare(a.name)); // Descending (newest first if timestamp prefix)

    return new Response(JSON.stringify(reports), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
