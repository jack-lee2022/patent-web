/**
 * POST /api/create-task
 * Creates a GitHub Issue from the analysis request form.
 * Requires GITHUB_TOKEN env var in Cloudflare Pages settings.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || "jack-lee2022/patent_agent";

  if (!token) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const mode = body.mode || "sota";
  const titleText = body.topic || body.invention || body.product || "Untitled";
  const title = `[${mode.toUpperCase()}] ${titleText}`;
  const issueBody = "```json\n" + JSON.stringify(body, null, 2) + "\n```";

  try {
    const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "patent-web/1.0",
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: ["patent-analysis", "pending"],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(
        JSON.stringify({ error: errText }),
        { status: resp.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    return new Response(
      JSON.stringify({
        success: true,
        issue_number: data.number,
        url: data.html_url,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
