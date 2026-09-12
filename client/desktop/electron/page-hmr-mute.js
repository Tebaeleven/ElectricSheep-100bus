/**
 * Runs in the page world (via session.registerPreloadScript type:frame).
 * Prevents Next.js HMR from opening chunked streams that Chromium aborts
 * with `OnSizeReceived failed with Error: -2` inside Electron.
 */
(function muteNextHmrInPage() {
  const block = (url) =>
    /webpack-hmr|hot-update|__nextjs_original-stack-frames/i.test(
      String(url || "")
    );

  const ES = window.EventSource;
  if (typeof ES === "function") {
    window.EventSource = function PatchedEventSource(url, config) {
      if (block(url)) {
        const fake = {
          readyState: 2,
          url: String(url || ""),
          withCredentials: false,
          close() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
          onopen: null,
          onmessage: null,
          onerror: null,
        };
        return fake;
      }
      return new ES(url, config);
    };
    window.EventSource.prototype = ES.prototype;
    Object.assign(window.EventSource, ES);
  }

  const WO = window.WebSocket;
  if (typeof WO === "function") {
    window.WebSocket = function PatchedWebSocket(url, protocols) {
      if (block(url)) {
        return {
          readyState: 3,
          url: String(url || ""),
          bufferedAmount: 0,
          extensions: "",
          protocol: "",
          binaryType: "blob",
          close() {},
          send() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          },
          onopen: null,
          onmessage: null,
          onerror: null,
          onclose: null,
        };
      }
      return protocols === undefined ? new WO(url) : new WO(url, protocols);
    };
    window.WebSocket.prototype = WO.prototype;
    Object.assign(window.WebSocket, WO);
  }

  const of = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input && typeof input === "object" && "url" in input
          ? input.url
          : String(input);
    if (block(url)) {
      return Promise.resolve(new Response("", { status: 204 }));
    }
    return of(input, init);
  };
})();
