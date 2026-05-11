/**
 * GET /api/list-tasks?state=all|open|closed
 * Lists GitHub Issues with the "patent-analysis" label.
 */

export async function onRequestGet(context) {
  const { request, env } = context;

  // DEBUG: show available env keys (values hidden)
  const envKeys = Object.keys(env);

  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPO || "jack-lee2022/patent_agent";

  if (!token) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN not configured", env_keys: envKeys }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "all";

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${repo}/issues?labels=patent-analysis&state=${state}&per_page=30`,
      {
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "patent-web/1.0",
        },
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      return new Response(
        JSON.stringify({ error: err }),
        { status: resp.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const tasks = data.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels.map((l) => l.name),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      url: issue.html_url,
      body: issue.body,
    }));

    return new Response(JSON.stringify(tasks), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
