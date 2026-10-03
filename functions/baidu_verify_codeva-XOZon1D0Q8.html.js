export function onRequest() {
  return new Response("3cfbb4a89a9a5fcf310dcdc33ba554d6", {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-cache"
    }
  });
}