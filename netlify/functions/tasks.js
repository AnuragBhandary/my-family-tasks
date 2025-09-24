// netlify/functions/tasks.js
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;

// Minimal Supabase REST helper
async function supa(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

function prevMonthKey(now = new Date()) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const mm = String(prev.getMonth() + 1).padStart(2, "0");
  return `${prev.getFullYear()}-${mm}`;
}

// Single shared "family" board (no per-user auth)
const FAMILY_UID = "family";

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;

    if (method === "GET") {
      const active = await supa(
        `/tasks?user_id=eq.${FAMILY_UID}&is_archived=eq.false&select=*&order=created_at.desc`
      );
      const archivedRows = await supa(
        `/tasks?user_id=eq.${FAMILY_UID}&is_archived=eq.true&select=*&order=archive_month.desc,created_at.desc`
      );
      const archives = {};
      for (const t of archivedRows) {
        const key = t.archive_month || "unknown";
        (archives[key] ||= []).push(t);
      }
      return { statusCode: 200, body: JSON.stringify({ tasks: active, archives }) };
    }

    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (body.action === "create") {
        const row = {
          user_id: FAMILY_UID,
          title: String(body.title || "").trim().slice(0, 200),
          description: body.description || "",
          status: body.status || "todo",
          priority: Math.max(1, Math.min(5, body.priority || 3)),
        };
        const inserted = await supa(`/tasks`, {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(row),
        });
        return { statusCode: 200, body: JSON.stringify(inserted[0]) };
      }

      if (body.action === "archive_rollover") {
        const now = new Date();
        const startOfMonthISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthKey = prevMonthKey(now);
        const updated = await supa(
          `/tasks?user_id=eq.${FAMILY_UID}&is_archived=eq.false&status=eq.done&updated_at=lt.${encodeURIComponent(
            startOfMonthISO
          )}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              is_archived: true,
              archive_month: monthKey,
              updated_at: new Date().toISOString(),
            }),
          }
        );
        return { statusCode: 200, body: JSON.stringify({ archived: updated.length }) };
      }

      return { statusCode: 400, body: "Unknown action" };
    }

    if (method === "PATCH") {
      const body = JSON.parse(event.body || "{}");
      const id = body.id;
      if (!id) return { statusCode: 400, body: "Missing id" };

      const allowed = {};
      if ("title" in body) allowed.title = String(body.title).slice(0, 200);
      if ("description" in body) allowed.description = String(body.description);
      if ("status" in body) allowed.status = body.status;
      if ("priority" in body) allowed.priority = Math.max(1, Math.min(5, body.priority | 0));
      allowed.updated_at = new Date().toISOString();

      const updated = await supa(`/tasks?id=eq.${id}&user_id=eq.${FAMILY_UID}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(allowed),
      });
      return { statusCode: 200, body: JSON.stringify(updated[0]) };
    }

    if (method === "DELETE") {
      const body = JSON.parse(event.body || "{}");
      const id = body.id;
      if (!id) return { statusCode: 400, body: "Missing id" };
      await supa(`/tasks?id=eq.${id}&user_id=eq.${FAMILY_UID}`, { method: "DELETE" });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    return { statusCode: 500, body: String(err && err.message || err) };
  }
};
