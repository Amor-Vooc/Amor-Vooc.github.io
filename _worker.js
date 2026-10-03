export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/baidu_verify_codeva-XOZon1D0Q8.html") {
      return new Response("3cfbb4a89a9a5fcf310dcdc33ba554d6", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};