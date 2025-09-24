export default async (request, context) => {
  const user = Deno.env.get("BASIC_AUTH_USER") || "parents";
  const pass = Deno.env.get("BASIC_AUTH_PASS") || "";
  const auth = request.headers.get("authorization") || "";

  if (auth.startsWith("Basic ")) {
    const [u, p] = atob(auth.slice(6)).split(":");
    if (u === user && p === pass) {
      return context.next();
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Anu\'s Task Board"', // <= straight quote
      "Cache-Control": "no-store",
    },
  });
};
