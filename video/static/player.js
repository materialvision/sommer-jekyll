/* Minimal HLS player: native HLS on Safari/iOS, hls.js everywhere else.
   Native controls do the heavy lifting; we add a poster/play overlay and a
   quality selector for the hls.js path. */
(function () {
  "use strict";

  var root = document.getElementById("player");
  if (!root) return;
  var video = root.querySelector("video");
  var overlay = document.getElementById("play-overlay");
  var spinner = document.getElementById("spinner");
  var errorBox = document.getElementById("player-error");
  var errorDetail = document.getElementById("error-detail");
  var qualityButton = document.getElementById("quality-button");

  var src = root.dataset.src;
  var autoplay = root.dataset.autoplay === "1";
  var startMuted = root.dataset.muted === "1";
  var background = root.dataset.background === "1";
  var startAt = parseFloat(root.dataset.start || "0") || 0;
  var controlsEnabled = root.dataset.controls !== "0";
  var started = false;
  var hls = null;
  var levels = [];
  var qualityMenu = null;

  root.classList.add("paused");
  // Start with the custom poster button only. Native controls appear after
  // playback starts, avoiding two centre play buttons before the first click.
  video.removeAttribute("controls");

  if (!controlsEnabled) {
    video.style.cursor = "pointer";
  }

  function showSpinner(show) {
    if (spinner) spinner.hidden = !show;
  }

  function showError(message) {
    if (!errorBox) return;
    errorBox.hidden = false;
    if (errorDetail) errorDetail.textContent = message || "";
    if (overlay) overlay.classList.add("hidden");
    showSpinner(false);
  }

  function hideOverlay() {
    if (overlay) overlay.classList.add("hidden");
    root.classList.remove("paused");
  }

  function showOverlay() {
    if (overlay && !background) overlay.classList.remove("hidden");
    root.classList.add("paused");
  }

  function tryPlay() {
    video.muted = startMuted || background;
    var promise = video.play();
    if (promise && promise.catch) {
      promise.catch(function () {
        // Autoplay blocked: leave the poster + play button visible.
        showOverlay();
        showSpinner(false);
      });
    }
  }

  function seekStart() {
    if (startAt > 0 && isFinite(video.duration) && startAt < video.duration - 1) {
      try { video.currentTime = startAt; } catch (e) { /* ignore */ }
    }
  }

  function labelForLevel(level) {
    if (!level) return "";
    return (level.height || level.width) + "p";
  }

  function rebuildQualityMenu() {
    if (!qualityButton || !levels.length) return;
    if (qualityMenu) qualityMenu.remove();
    qualityMenu = document.createElement("div");
    qualityMenu.className = "quality-menu";
    qualityMenu.hidden = true;
    qualityButton.setAttribute("aria-expanded", "false");

    var auto = document.createElement("button");
    auto.type = "button";
    auto.dataset.level = "-1";
    auto.innerHTML = "<span>Auto</span><span class='tick'>✓</span>";
    auto.classList.add("active");
    qualityMenu.appendChild(auto);

    levels
      .map(function (level, index) { return { level: level, index: index }; })
      .sort(function (a, b) { return (b.level.height || 0) - (a.level.height || 0); })
      .forEach(function (item) {
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.level = String(item.index);
        var name = document.createElement("span");
        name.textContent = labelForLevel(item.level);
        var tick = document.createElement("span");
        tick.className = "tick";
        button.appendChild(name);
        button.appendChild(tick);
        qualityMenu.appendChild(button);
      });

    qualityMenu.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-level]");
      if (!button || !hls) return;
      var level = parseInt(button.dataset.level, 10);
      hls.currentLevel = level;
      Array.prototype.forEach.call(qualityMenu.children, function (el) {
        el.classList.toggle("active", el === button);
        var tick = el.querySelector(".tick");
        if (tick) tick.textContent = el === button ? "✓" : "";
      });
      qualityButton.textContent = level === -1 ? "Auto" : labelForLevel(hls.levels[level]);
      qualityMenu.hidden = true;
      qualityButton.setAttribute("aria-expanded", "false");
    });

    root.appendChild(qualityMenu);
    qualityButton.hidden = false;

    qualityButton.addEventListener("click", function (event) {
      event.stopPropagation();
      qualityMenu.hidden = !qualityMenu.hidden;
      qualityButton.setAttribute("aria-expanded", String(!qualityMenu.hidden));
    });

    document.addEventListener("click", function (event) {
      if (!qualityMenu || qualityMenu.hidden) return;
      if (!qualityMenu.contains(event.target) && event.target !== qualityButton) {
        qualityMenu.hidden = true;
        qualityButton.setAttribute("aria-expanded", "false");
      }
    });
  }

  if (overlay) {
    overlay.addEventListener("click", function () {
      tryPlay();
    });
  }

  if (!controlsEnabled) {
    video.addEventListener("click", function () {
      if (video.paused) tryPlay();
      else video.pause();
    });
  }

  video.addEventListener("play", function () {
    if (controlsEnabled && !started) {
      started = true;
      video.setAttribute("controls", "");
    }
    hideOverlay();
    showSpinner(true);
  });
  video.addEventListener("playing", function () {
    hideOverlay();
    showSpinner(false);
  });
  video.addEventListener("canplay", function () { showSpinner(false); });
  video.addEventListener("waiting", function () { showSpinner(true); });
  video.addEventListener("pause", function () {
    if ((!started || !controlsEnabled) && !video.ended) showOverlay();
    else hideOverlay();
    showSpinner(false);
  });
  video.addEventListener("ended", function () {
    if (!started || !controlsEnabled) {
      if (!background) showOverlay();
    } else {
      hideOverlay();
    }
  });
  video.addEventListener("error", function () {
    if (!hls) showError(video.error ? video.error.message : "Media error");
  });
  video.addEventListener("loadedmetadata", seekStart);

  document.addEventListener("keydown", function (event) {
    var tag = (event.target && event.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.code === "Space" || event.key === "k") {
      event.preventDefault();
      if (video.paused) tryPlay(); else video.pause();
    } else if (event.key === "ArrowRight") {
      video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
    } else if (event.key === "ArrowLeft") {
      video.currentTime = Math.max(0, video.currentTime - 5);
    } else if (event.key === "f") {
      if (!document.fullscreenElement) {
        (root.requestFullscreen || root.webkitRequestFullscreen || function () {}).call(root);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      }
    } else if (event.key === "m") {
      video.muted = !video.muted;
    }
  });

  var isSafari = /Safari/.test(navigator.userAgent) &&
    !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Firefox/.test(navigator.userAgent);
  var nativeHls = video.canPlayType("application/vnd.apple.mpegurl");

  if (isSafari && nativeHls) {
    // Safari / iOS: native HLS, including AirPlay and the native quality menu.
    video.src = src;
    video.addEventListener("loadedmetadata", function () {
      if (autoplay) tryPlay();
    });
    video.load();
  } else if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({
      capLevelToPlayerSize: true,
      startLevel: -1,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      backBufferLength: 30,
      abrEwmaDefaultEstimate: 800000
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, function (_event, data) {
      levels = data.levels || [];
      if (levels.length > 1) rebuildQualityMenu();
      if (autoplay) tryPlay();
    });
    hls.on(window.Hls.Events.LEVEL_SWITCHED, function (_event, data) {
      if (!qualityButton || !hls) return;
      var current = hls.levels[data.level];
      if (hls.autoLevelEnabled) {
        qualityButton.textContent = current ? "Auto " + labelForLevel(current) : "Auto";
      }
    });
    hls.on(window.Hls.Events.ERROR, function (_event, data) {
      if (!data.fatal) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
      } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      } else {
        showError(data.details || "Playback error");
        hls.destroy();
      }
    });
  } else if (nativeHls) {
    // iOS Chrome/Firefox and other WebKit shells without MSE.
    video.src = src;
    video.addEventListener("loadedmetadata", function () {
      if (autoplay) tryPlay();
    });
    video.load();
  } else {
    // Last resort: let the browser try the playlist directly.
    video.src = src;
    showError("HLS is not supported in this browser.");
  }

  if (background) {
    if (overlay) overlay.classList.add("hidden");
    if (qualityButton) qualityButton.hidden = true;
  }
})();
