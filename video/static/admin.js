/* Admin UI — vanilla JS, no build step. */
(function () {
  "use strict";

  var state = {
    token: localStorage.getItem("vs_admin_token") || "",
    videos: [],
    config: {},
    stats: {},
    uploadFile: null,
    pollTimer: null
  };

  var $ = function (id) { return document.getElementById(id); };
  var login = $("login");
  var app = $("app");
  var grid = $("video-grid");
  var toastTimer = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, isError) {
    var el = $("toast");
    el.textContent = message;
    el.classList.toggle("error", !!isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    headers.Authorization = "Bearer " + state.token;
    var response = await fetch(path, Object.assign({}, options, { headers: headers }));
    var text = await response.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { detail: text }; }
    if (response.status === 401) {
      lock();
      throw new Error("Unauthorized");
    }
    if (!response.ok) throw new Error(data.detail || response.statusText);
    return data;
  }

  function lock() {
    state.token = "";
    localStorage.removeItem("vs_admin_token");
    app.hidden = true;
    login.hidden = false;
    $("logout").hidden = true;
    $("token-input").focus();
  }

  async function load() {
    var data = await api("/admin/api/videos");
    state.videos = data.videos || [];
    state.config = data.config || {};
    state.stats = data.stats || {};
    login.hidden = true;
    app.hidden = false;
    $("logout").hidden = false;
    $("stats").textContent = state.stats.count + (state.stats.count === 1 ? " video · " : " videos · ") + state.stats.total_size;
    $("storage-mode").textContent = state.config.spaces
      ? "Media served from Spaces CDN"
      : state.config.server_encode
        ? "Media served from this server · encoding enabled"
        : "Media served from this server · encode locally";
    $("open-upload").hidden = !state.config.server_encode;
    $("library-hint").textContent =
      "Embeds point at " + state.config.base_url + "/embed/<slug>";
    render();
  }

  function render() {
    if (!state.videos.length) {
      grid.innerHTML = "";
      $("empty").hidden = false;
      return;
    }
    $("empty").hidden = true;
    grid.innerHTML = state.videos.map(function (video) {
      var badges = [];
      if (video.unlisted) badges.push("unlisted");
      if (video.vimeo_id) badges.push("vimeo " + video.vimeo_id);
      return [
        '<article class="admin-card" data-slug="' + escapeHtml(video.slug) + '">',
        '  <a class="card-poster" href="' + escapeHtml(video.watch_url) + '" target="_blank" rel="noopener">',
        '    <img src="' + escapeHtml(video.poster_url) + '" alt="" loading="lazy">',
        '  </a>',
        '  <div class="card-body">',
        '    <h3>' + escapeHtml(video.title) + '</h3>',
        '    <p class="card-meta">' + escapeHtml(video.date || "") +
        (video.duration_human ? " · " + escapeHtml(video.duration_human) : "") +
        (video.size ? " · " + escapeHtml(video.size) : "") + '</p>',
        badges.length ? '    <p class="badges">' + badges.map(function (b) {
          return '<span>' + escapeHtml(b) + '</span>';
        }).join("") + '</p>' : "",
        '    <div class="card-actions">',
        '      <button type="button" data-action="copy-embed">Copy embed</button>',
        '      <button type="button" data-action="copy-iframe">Iframe</button>',
        '      <button type="button" data-action="edit">Edit</button>',
        '      <a href="' + escapeHtml(video.watch_url) + '" target="_blank" rel="noopener">View</a>',
        state.config.server_encode ? '      <button type="button" data-action="reencode">Re-encode</button>' : "",
        '      <button type="button" class="danger" data-action="delete">Delete</button>',
        '    </div>',
        '  </div>',
        '</article>'
      ].join("\n");
    }).join("\n");
  }

  function findVideo(slug) {
    return state.videos.find(function (v) { return v.slug === slug; });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    area.remove();
    return Promise.resolve();
  }

  // ---------- login ----------

  $("login-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    state.token = $("token-input").value.trim();
    $("login-error").hidden = true;
    try {
      await load();
      localStorage.setItem("vs_admin_token", state.token);
    } catch (error) {
      $("login-error").textContent = error.message;
      $("login-error").hidden = false;
    }
  });

  $("logout").addEventListener("click", lock);

  // ---------- grid actions ----------

  grid.addEventListener("click", async function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var card = button.closest(".admin-card");
    var video = findVideo(card.dataset.slug);
    if (!video) return;
    var action = button.dataset.action;

    if (action === "copy-embed") {
      await copyText(video.embed_code);
      toast("Embed code copied");
    } else if (action === "copy-iframe") {
      await copyText(video.iframe_code);
      toast("Iframe code copied");
    } else if (action === "edit") {
      openEdit(video);
    } else if (action === "delete") {
      if (!confirm('Delete "' + video.title + '"? It is moved to data/trash, not erased.')) return;
      try {
        await api("/admin/api/videos/" + encodeURIComponent(video.slug), { method: "DELETE" });
        toast("Moved to trash");
        await load();
      } catch (error) { toast(error.message, true); }
    } else if (action === "reencode") {
      if (!confirm("Re-encode from the stored source file? The current version stays live until the new one is ready.")) return;
      try {
        var job = await api("/admin/api/videos/" + encodeURIComponent(video.slug) + "/encode", { method: "POST" });
        pollJob(job);
      } catch (error) { toast(error.message, true); }
    }
  });

  // ---------- edit ----------

  var dialog = $("edit-dialog");

  function openEdit(video) {
    $("edit-slug").value = video.slug;
    $("edit-title").value = video.title || "";
    $("edit-date").value = video.date || "";
    $("edit-description").value = video.description || "";
    $("edit-credits").value = video.credits || "";
    $("edit-vimeo").value = video.vimeo_id || "";
    $("edit-unlisted").checked = !!video.unlisted;
    $("edit-noindex").checked = !!video.noindex;
    dialog.showModal();
  }

  $("edit-cancel").addEventListener("click", function () { dialog.close(); });

  $("edit-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var slug = $("edit-slug").value;
    var payload = {
      title: $("edit-title").value.trim(),
      date: $("edit-date").value.trim(),
      description: $("edit-description").value,
      credits: $("edit-credits").value,
      vimeo_id: $("edit-vimeo").value.trim(),
      unlisted: $("edit-unlisted").checked,
      noindex: $("edit-noindex").checked
    };
    try {
      await api("/admin/api/videos/" + encodeURIComponent(slug), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      dialog.close();
      toast("Saved");
      await load();
    } catch (error) { toast(error.message, true); }
  });

  // ---------- upload ----------

  var panel = $("upload-panel");

  $("open-upload").addEventListener("click", function () {
    panel.hidden = !panel.hidden;
  });
  $("upload-cancel").addEventListener("click", function () {
    panel.hidden = true;
    $("upload-form").reset();
    state.uploadFile = null;
    $("filename").textContent = "";
  });
  $("choose-file").addEventListener("click", function () { $("file-input").click(); });
  $("file-input").addEventListener("change", function (event) {
    setFile(event.target.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (type) {
    $("dropzone").addEventListener(type, function (event) {
      event.preventDefault();
      $("dropzone").classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach(function (type) {
    $("dropzone").addEventListener(type, function (event) {
      event.preventDefault();
      $("dropzone").classList.remove("dragging");
    });
  });
  $("dropzone").addEventListener("drop", function (event) {
    var file = event.dataTransfer.files[0];
    if (file) setFile(file);
  });

  function slugify(value) {
    var map = { "æ": "ae", "ø": "o", "å": "a", "ä": "a", "ö": "o", "ü": "u", "é": "e", "è": "e" };
    return value.toLowerCase().replace(/[æøåäöüéè]/g, function (ch) { return map[ch] || ch; })
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function setFile(file) {
    state.uploadFile = file || null;
    if (!file) { $("filename").textContent = ""; return; }
    $("filename").textContent = file.name + " · " + (file.size / 1024 / 1024).toFixed(0) + " MB";
    var base = file.name.replace(/\.[^.]+$/, "");
    if (!$("upload-title").value) $("upload-title").value = base;
    if (!$("upload-slug").value) $("upload-slug").value = slugify(base);
  }

  $("upload-title").addEventListener("input", function () {
    if (!$("upload-slug").dataset.touched) {
      $("upload-slug").value = slugify($("upload-title").value);
    }
  });
  $("upload-slug").addEventListener("input", function () {
    $("upload-slug").dataset.touched = "1";
  });

  $("upload-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (!state.uploadFile) { toast("Choose a file first", true); return; }
    var slug = $("upload-slug").value.trim();
    if (!slug) { toast("Slug is required", true); return; }
    var params = new URLSearchParams({
      title: $("upload-title").value.trim() || slug,
      description: $("upload-description").value,
      date: $("upload-date").value.trim(),
      force: "0"
    });
    upload(slug, params, false);
  });

  function upload(slug, params, force) {
    if (force) params.set("force", "1");
    var xhr = new XMLHttpRequest();
    var progress = $("upload-progress");
    progress.hidden = false;
    progress.value = 0;
    $("upload-status").textContent = "uploading…";
    $("upload-submit").disabled = true;

    xhr.open("PUT", "/admin/api/videos/" + encodeURIComponent(slug) + "/source?" + params.toString());
    xhr.setRequestHeader("Authorization", "Bearer " + state.token);
    xhr.setRequestHeader("X-Filename", state.uploadFile.name);

    xhr.upload.onprogress = function (event) {
      if (!event.lengthComputable) return;
      progress.value = event.loaded / event.total;
      $("upload-status").textContent = "uploading " + Math.round(progress.value * 100) + "%";
    };

    xhr.onload = async function () {
      $("upload-submit").disabled = false;
      var data = {};
      try { data = JSON.parse(xhr.responseText || "{}"); } catch (e) { data = {}; }
      if (xhr.status === 409 && !force) {
        if (confirm("A video with that slug exists. Replace it? The old version stays live until encoding finishes.")) {
          upload(slug, params, true);
        }
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        $("upload-status").textContent = "";
        toast(data.detail || ("Upload failed: " + xhr.status), true);
        return;
      }
      $("upload-status").textContent = "queued";
      panel.hidden = true;
      $("upload-form").reset();
      state.uploadFile = null;
      $("filename").textContent = "";
      pollJob(data);
    };

    xhr.onerror = function () {
      $("upload-submit").disabled = false;
      $("upload-status").textContent = "";
      toast("Upload failed", true);
    };

    xhr.send(state.uploadFile);
  }

  // ---------- jobs ----------

  async function pollJob(job) {
    var banner = $("job-banner");
    banner.hidden = false;
    $("job-title").textContent = job.slug ? "Encoding " + job.slug : "Encoding";
    clearInterval(state.pollTimer);
    var tick = async function () {
      try {
        var current = await api("/admin/api/jobs/" + encodeURIComponent(job.id));
        $("job-progress").value = current.progress;
        $("job-message").textContent = current.message + " · " + Math.round(current.progress * 100) + "%";
        if (current.status === "done") {
          clearInterval(state.pollTimer);
          banner.hidden = true;
          toast("Encoding finished");
          await load();
        } else if (current.status === "error") {
          clearInterval(state.pollTimer);
          banner.hidden = true;
          toast(current.error || "Encoding failed", true);
        }
      } catch (error) {
        clearInterval(state.pollTimer);
        banner.hidden = true;
        toast(error.message, true);
      }
    };
    tick();
    state.pollTimer = setInterval(tick, 1500);
  }

  $("refresh").addEventListener("click", function () {
    load().then(function () { toast("Refreshed"); }).catch(function (error) { toast(error.message, true); });
  });

  // ---------- boot ----------

  if (state.token) {
    load().catch(function () { lock(); });
  } else {
    login.hidden = false;
    $("token-input").focus();
  }
})();
