/* Responsive embed helper.
 *
 *   <div class="vs-video" data-vs-video="my-film"></div>
 *   <script src="https://video.example.com/embed.js" async></script>
 *
 * Optional attributes: data-vs-ratio="16/9", data-vs-autoplay="1",
 * data-vs-loop="1", data-vs-title="0", data-vs-start="12".
 */
(function () {
  "use strict";
  var EMBED_TEMPLATE = "embed/{slug}.html";
  var script = document.currentScript;
  var base = script && script.src ? new URL(".", script.src).href : "/";
  var template = (script && script.dataset.vsEmbed) || EMBED_TEMPLATE;

  function mount(el) {
    if (el.dataset.vsMounted === "1") return;
    var slug = el.dataset.vsVideo || el.dataset.video;
    if (!slug) return;
    el.dataset.vsMounted = "1";

    var params = new URLSearchParams();
    ["autoplay", "loop", "title", "start", "background", "muted"].forEach(function (key) {
      var value = el.dataset["vs" + key.charAt(0).toUpperCase() + key.slice(1)];
      if (value !== undefined && value !== "") params.set(key, value);
    });

    var iframe = document.createElement("iframe");
    iframe.src =
      base +
      template.replace("{slug}", encodeURIComponent(slug)) +
      (params.toString() ? "?" + params : "");
    iframe.title = el.dataset.vsLabel || slug;
    iframe.loading = "lazy";
    iframe.allow = "autoplay; fullscreen; picture-in-picture; clipboard-write";
    iframe.allowFullscreen = true;
    iframe.setAttribute("frameborder", "0");
    iframe.style.position = "absolute";
    iframe.style.inset = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";

    var ratio = el.dataset.vsRatio || "16/9";
    el.style.position = "relative";
    el.style.width = "100%";
    el.style.aspectRatio = ratio;
    el.style.background = "#000";
    el.style.overflow = "hidden";
    el.appendChild(iframe);
  }

  function scan(rootNode) {
    (rootNode || document).querySelectorAll("[data-vs-video]").forEach(mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scan(); });
  } else {
    scan();
  }

  if (window.MutationObserver && document.body) {
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches("[data-vs-video]")) mount(node);
          if (node.querySelectorAll) scan(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.VideoServer = { mount: mount, scan: scan };
})();
