/**
 * FightWatch — config.js
 * Proxy base: use ?mode=test in the page URL for TEST; otherwise PROD.
 */
(function (global) {
  "use strict";
  var BASE_BY_MODE = {
    prod: "https://martialmatch.andruwik777.workers.dev",
    test: "https://test-martialmatch.andruwik777.workers.dev",
  };
  var loc = global.location;
  var pageParams =
    loc && typeof URLSearchParams !== "undefined"
      ? new URLSearchParams(loc.search || "")
      : null;
  var modeParam = pageParams ? pageParams.get("mode") : null;
  var isTest =
    modeParam !== null && String(modeParam).toLowerCase() === "test";
  var mode = isTest ? "test" : "prod";
  var baseUrl = BASE_BY_MODE[mode] || BASE_BY_MODE.prod;

  /** Odświeżanie listy walk co 30 sekund */
  var CURRENT_MATCHES_REFRESH_MS = 30000;

  function withModeQuery(href) {
    if (!isTest || !href) return href;
    if (/[?&]mode=test(?:&|$|#)/i.test(href)) return href;
    var hashStart = href.indexOf("#");
    var hash = hashStart >= 0 ? href.slice(hashStart) : "";
    var path = hashStart >= 0 ? href.slice(0, hashStart) : href;
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    return path + sep + "mode=test" + hash;
  }

  function parseEventSlug(raw) {
    if (raw == null || typeof raw !== "string") return null;
    var s = raw.trim();
    try { s = decodeURIComponent(s); } catch (e) { return null; }
    s = s.trim();
    if (!s) return null;
    var m = s.match(/^(\d+)-(.+)$/);
    if (!m || !m[2]) return null;
    return { slug: s, numericId: m[1], tail: m[2] };
  }

  global.MM_CONFIG = {
    mode: mode,
    baseUrl: baseUrl,
    isTestMode: isTest,
    withModeQuery: withModeQuery,
    currentMatchesRefreshMs: CURRENT_MATCHES_REFRESH_MS,
    url: function (path) {
      var p = path.charAt(0) === "/" ? path : "/" + path;
      return baseUrl + p;
    },
    parseEventSlug: parseEventSlug,
  };

  function shouldAppendMode(href) {
    if (!href) return false;
    return !/^(?:https?:|mailto:|tel:)/i.test(href.trim());
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("a.fw-nav-link[href]").forEach(function (a) {
        var h = a.getAttribute("href");
        if (h && shouldAppendMode(h)) a.href = withModeQuery(h);
      });
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
