// The routing table: path prefix → origin (independent deployments)
const ZONES: Record<string, string> = {
  "/gamer": "https://mfe-gamer.vercel.app/gamer",
  "/quests": "https://mfe-quests.vercel.app/quests",
};
const HOME = "https://mfe-home-inky.vercel.app/";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Match "/gamer" or "/gamer/..." but not "/gamerzzz"
    const prefix = Object.keys(ZONES).find(
      (p) => url.pathname === p || url.pathname.startsWith(p + "/"),
    );
    const origin = prefix ? ZONES[prefix] : HOME;

    // Forward full path unchanged: /gamer/profile → gamer origin /gamer/profile
    const target = new URL(url.pathname + url.search, origin);
    const upstream = await fetch(new Request(target, request), {
      redirect: "manual",
    });

    // Tag responses so you can see who served what in DevTools
    const res = new Response(upstream.body, upstream);
    res.headers.set("x-served-by", prefix ? prefix.slice(1) : "home");
    return res;
  },
};
