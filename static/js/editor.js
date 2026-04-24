/**
 * Scene Editor logic.
 * 
 * Reordering is handled by SortableJS (MIT License).
 */

class SceneEditor {
  constructor() {
    this.form = document.getElementById("scene-form");
    this.sceneIdInput = document.getElementById("scene-id");
    this.sceneNameInput = document.getElementById("scene-name");
    this.bgHiddenInput = document.getElementById("scene-background");
    this.bgThumb = document.getElementById("bg-thumb");
    this.bgFilename = document.getElementById("bg-filename");
    this.changeBgBtn = document.getElementById("change-bg-btn");
    this.layerList = document.getElementById("layer-list");
    this.addLayerBtn = document.getElementById("add-layer-btn");
    this.saveBtn = document.getElementById("save-btn");
    this.deleteBtn = document.getElementById("delete-btn");
    this.popOutBtn = document.getElementById("pop-out-btn");
    this.errorArea = document.getElementById("error-area");
    this.titleDirtyIndicator = document.getElementById("title-dirty-indicator");

    this.isDirty = false;
    this.layers = [];
    this.availableAssets = { image: [], video: [] };

    if (window.EDIT_MODE) {
      this.initEditor();
    } else {
      this.initListView();
    }
  }

  async initListView() {
    const res = await fetch("/api/scenes");
    const scenes = await res.json();
    const body = document.getElementById("scene-list-body");
    body.innerHTML = scenes.map(scene => `
      <tr>
        <td><code>${scene.id}</code></td>
        <td>${scene.name}</td>
        <td>${this._getShortName(scene.background)}</td>
        <td>${scene.layers.length} layers</td>
        <td class="row-actions">
          <a href="/editor/${scene.id}" class="action-link">Edit</a>
          <a href="#" class="action-link is-delete" data-id="${scene.id}">Delete</a>
        </td>
      </tr>
    `).join("");

    body.querySelectorAll(".is-delete").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.deleteScene(btn.dataset.id);
      });
    });
  }

  async initEditor() {
    // Initialize SceneEngine for preview
    this.sceneEngine = new SceneEngine({
      container: document.getElementById("preview-stage")
    });

    // Fetch available assets to check for missing files
    const [imgRes, vidRes] = await Promise.all([
      fetch("/api/assets/images"),
      fetch("/api/assets/videos")
    ]);
    this.availableAssets.image = await imgRes.json();
    this.availableAssets.video = await vidRes.json();

    if (window.SCENE_ID !== "new") {
      const res = await fetch(`/api/scenes/${window.SCENE_ID}`);
      const scene = await res.json();
      this.loadScene(scene);
    } else {
      this.isDirty = false; // Reset dirty for new scene
    }

    this.setupEventListeners();
    this.setupSortable();
    this.updatePreview();
  }

  loadScene(scene) {
    this.sceneIdInput.value = scene.id;
    this.sceneNameInput.value = scene.name;
    this.updateBackground(scene.background);
    
    this.layers = scene.layers.map(l => ({ ...l, hidden: false }));
    this.renderLayers();
    this.isDirty = false;
    this.updateDirtyIndicator();
  }

  updateBackground(url) {
    const shortName = this._getShortName(url);
    this.bgHiddenInput.value = shortName;
    this.bgFilename.textContent = shortName;
    this.bgThumb.src = this._toStaticUrl(shortName, "image");
    this.bgThumb.style.display = "block";

    // Check if missing
    if (!this.availableAssets.image.some(a => a.name === shortName)) {
      this.bgThumb.classList.add("is-missing");
    } else {
      this.bgThumb.classList.remove("is-missing");
    }
  }

  renderLayers() {
    this.layerList.innerHTML = "";
    this.layers.forEach((layer, index) => {
      const card = this._createLayerCard(layer, index);
      this.layerList.appendChild(card);
    });
  }

  _createLayerCard(layer, index) {
    const shortName = this._getShortName(layer.src);
    const isVideo = layer.type === "video" || shortName.endsWith(".webm") || shortName.endsWith(".mp4");
    const isMissing = !this.availableAssets[isVideo ? "video" : "image"].some(a => a.name === shortName);
    const staticUrl = this._toStaticUrl(shortName, isVideo ? "video" : "image");

    const card = document.createElement("div");
    card.className = `layer-card ${layer.hidden ? "is-hidden" : ""}`;
    card.dataset.index = index;
    card.innerHTML = `
      <div class="layer-header">
        <div class="layer-drag-handle">☰</div>
        <img class="layer-thumbnail ${isMissing ? "is-missing" : ""}" src="${staticUrl}" alt="">
        <div class="layer-info">
          <div class="layer-filename" title="${shortName}">${shortName}</div>
          ${isMissing ? '<div class="layer-missing-label">Missing File</div>' : ""}
        </div>
        <div class="layer-actions">
          <button type="button" class="btn-icon toggle-visibility" title="Toggle visibility">${layer.hidden ? "👁️‍🗨️" : "👁️"}</button>
          <button type="button" class="btn-secondary change-layer-src">Change…</button>
          <button type="button" class="btn-danger remove-layer">Remove</button>
        </div>
      </div>
      <div class="layer-controls">
        ${this._createSlider("Opacity", "opacity", layer.opacity, 0, 1, 0.05)}
        ${this._createSlider("Brightness", "brightness", layer.brightness, 0, 2, 0.05)}
        ${this._createSlider("Blur", "blur", layer.blur, 0, 20, 0.5, "px")}
        ${this._createSlider("Grayscale", "grayscale", layer.grayscale, 0, 1, 0.05)}
        <div class="control-item">
          <label class="control-label">Blend Mode</label>
          <select class="blend-mode-select">
            ${["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]
              .map(mode => `<option value="${mode}" ${layer.blend_mode === mode ? "selected" : ""}>${mode}</option>`).join("")}
          </select>
        </div>
        <div class="control-item">
          <label class="control-label">Flip Horizontal</label>
          <input type="checkbox" class="flip-checkbox" ${layer.flip ? "checked" : ""}>
        </div>
      </div>
    `;

    // Wire up events
    card.querySelector(".toggle-visibility").addEventListener("click", () => {
      layer.hidden = !layer.hidden;
      this.renderLayers();
      this.updatePreview();
    });

    card.querySelector(".change-layer-src").addEventListener("click", async () => {
      try {
        const asset = await openAssetPicker({ kind: "any" });
        layer.src = asset.name;
        layer.type = asset.kind;
        this.setDirty();
        this.renderLayers();
        this.updatePreview();
      } catch (e) {}
    });

    card.querySelector(".remove-layer").addEventListener("click", () => {
      if (confirm(`Remove layer "${shortName}"?`)) {
        this.layers.splice(index, 1);
        this.setDirty();
        this.renderLayers();
        this.updatePreview();
      }
    });

    // Control inputs
    card.querySelectorAll('input[type="range"], input[type="number"]').forEach(input => {
      input.addEventListener("input", (e) => {
        const prop = e.target.dataset.prop;
        const val = parseFloat(e.target.value);
        layer[prop] = val;
        
        // Sync range and number
        const other = card.querySelector(`input[data-prop="${prop}"]:not([type="${e.target.type}"])`);
        if (other) other.value = e.target.value;

        this.setDirty();
        this.debouncedPreview();
      });
    });

    card.querySelectorAll(".btn-reset").forEach(btn => {
      btn.addEventListener("click", () => {
        const prop = btn.dataset.prop;
        const defaults = { opacity: 1, brightness: 1, blur: 0, grayscale: 0 };
        layer[prop] = defaults[prop];
        this.setDirty();
        this.renderLayers();
        this.updatePreview();
      });
    });

    card.querySelector(".blend-mode-select").addEventListener("change", (e) => {
      layer.blend_mode = e.target.value;
      this.setDirty();
      this.updatePreview();
    });

    card.querySelector(".flip-checkbox").addEventListener("change", (e) => {
      layer.flip = e.target.checked;
      this.setDirty();
      this.updatePreview();
    });

    return card;
  }

  _createSlider(label, prop, value, min, max, step, unit = "") {
    return `
      <div class="control-item">
        <div class="control-label-row">
          <span class="control-label">${label}</span>
          <button type="button" class="btn-reset" data-prop="${prop}">Reset</button>
        </div>
        <div class="control-inputs">
          <input type="range" data-prop="${prop}" min="${min}" max="${max}" step="${step}" value="${value}">
          <input type="number" data-prop="${prop}" min="${min}" max="${max}" step="${step}" value="${value}">
          ${unit ? `<span class="control-label">${unit}</span>` : ""}
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    this.sceneNameInput.addEventListener("input", () => this.setDirty());
    this.sceneIdInput.addEventListener("input", () => this.setDirty());

    this.changeBgBtn.addEventListener("click", async () => {
      try {
        const asset = await openAssetPicker({ kind: "image" });
        this.updateBackground(asset.name);
        this.setDirty();
        this.updatePreview();
      } catch (e) {}
    });

    this.addLayerBtn.addEventListener("click", async () => {
      try {
        const asset = await openAssetPicker({ kind: "any" });
        this.layers.push({
          src: asset.name,
          type: asset.kind,
          opacity: 1.0,
          brightness: 1.0,
          grayscale: 0.0,
          blur: 0.0,
          flip: false,
          blend_mode: "normal",
          hidden: false
        });
        this.setDirty();
        this.renderLayers();
        this.updatePreview();
      } catch (e) {}
    });

    this.saveBtn.addEventListener("click", () => this.saveScene());
    if (this.deleteBtn) {
      this.deleteBtn.addEventListener("click", () => this.deleteScene(window.SCENE_ID));
    }

    this.popOutBtn.addEventListener("click", () => {
      window.open(`/editor/${window.SCENE_ID}/preview`, "_blank", "width=1280,height=720");
    });

    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        this.saveScene();
      }
    });

    window.addEventListener("beforeunload", (e) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  setupSortable() {
    Sortable.create(this.layerList, {
      handle: ".layer-drag-handle",
      animation: 150,
      onEnd: (evt) => {
        const item = this.layers.splice(evt.oldIndex, 1)[0];
        this.layers.splice(evt.newIndex, 0, item);
        this.setDirty();
        this.renderLayers();
        this.updatePreview();
      }
    });
  }

  setDirty() {
    if (!this.isDirty) {
      this.isDirty = true;
      this.updateDirtyIndicator();
    }
  }

  updateDirtyIndicator() {
    const indicator = document.getElementById("dirty-indicator");
    if (indicator) indicator.style.display = this.isDirty ? "inline" : "none";
    if (this.titleDirtyIndicator) this.titleDirtyIndicator.style.display = this.isDirty ? "inline" : "none";
  }

  debouncedPreview() {
    if (this.previewTimeout) clearTimeout(this.previewTimeout);
    this.previewTimeout = setTimeout(() => this.updatePreview(), 100);
  }

  updatePreview() {
    if (!this.sceneEngine) return;

    const previewScene = {
      id: "preview",
      name: "Preview",
      background: this._toStaticUrl(this.bgHiddenInput.value, "image"),
      layers: this.layers
        .filter(l => !l.hidden)
        .map(l => ({
          ...l,
          src: this._toStaticUrl(l.src, l.type === "video" ? "video" : "image")
        }))
    };

    // Handle missing assets in preview
    const bgMissing = this.bgHiddenInput.value && !this.availableAssets.image.some(a => a.name === this.bgHiddenInput.value);
    
    // The engine doesn't natively support "missing" placeholders, we'll handle it by checking assets
    this.sceneEngine.renderScene(previewScene);

    // If BG missing, show placeholder
    const container = document.getElementById("preview-stage");
    let bgPlaceholder = container.querySelector(".preview-placeholder.bg-missing");
    if (bgMissing) {
      if (!bgPlaceholder) {
        bgPlaceholder = document.createElement("div");
        bgPlaceholder.className = "preview-placeholder bg-missing";
        bgPlaceholder.textContent = `Background missing: ${this.bgHiddenInput.value}`;
        container.appendChild(bgPlaceholder);
      }
    } else if (bgPlaceholder) {
      bgPlaceholder.remove();
    }

    // Layer missing placeholders
    container.querySelectorAll(".preview-placeholder.layer-missing").forEach(p => p.remove());
    previewScene.layers.forEach((l, idx) => {
      const shortName = this._getShortName(l.src);
      const isVideo = l.type === "video" || shortName.endsWith(".webm") || shortName.endsWith(".mp4");
      const isMissing = !this.availableAssets[isVideo ? "video" : "image"].some(a => a.name === shortName);
      if (isMissing) {
        const lp = document.createElement("div");
        lp.className = "preview-placeholder layer-missing";
        lp.style.zIndex = idx + 1;
        lp.textContent = `Layer missing: ${shortName}`;
        container.appendChild(lp);
      }
    });
  }

  async saveScene() {
    this.clearErrors();
    const sceneData = {
      id: this.sceneIdInput.value,
      name: this.sceneNameInput.value,
      background: this.bgHiddenInput.value,
      layers: this.layers.map(l => {
        const { hidden, ...rest } = l;
        return {
          ...rest,
          src: this._getShortName(l.src)
        };
      })
    };

    const isNew = window.SCENE_ID === "new";
    const url = isNew ? "/api/scenes" : `/api/scenes/${window.SCENE_ID}`;
    const method = isNew ? "POST" : "PUT";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sceneData)
      });

      if (res.ok) {
        this.isDirty = false;
        window.location.href = "/editor";
      } else if (res.status === 422) {
        const err = await res.json();
        this.showFieldErrors(err.detail);
      } else {
        const err = await res.json();
        this.showError(err.message || "Failed to save scene");
      }
    } catch (e) {
      this.showError("Network error: " + e.message);
    }
  }

  async deleteScene(id) {
    if (!confirm(`Are you sure you want to delete scene "${id}"?`)) return;

    try {
      const res = await fetch(`/api/scenes/${id}`, { method: "DELETE" });
      if (res.ok) {
        window.location.href = "/editor";
      } else {
        const err = await res.json();
        this.showError(err.message || "Failed to delete scene");
      }
    } catch (e) {
      this.showError("Network error: " + e.message);
    }
  }

  _getShortName(url) {
    if (!url) return "";
    const prefixes = ["/static/assets/images/", "/static/assets/video/", "/static/assets/"];
    for (const p of prefixes) {
      if (url.startsWith(p)) return url.slice(p.length);
    }
    return url;
  }

  _toStaticUrl(name, kind) {
    if (!name) return "";
    if (name.startsWith("/static/")) return name;
    const folder = kind === "video" ? "video" : "images";
    return `/static/assets/${folder}/${name}`;
  }

  showError(msg) {
    this.errorArea.textContent = msg;
    this.errorArea.style.display = "block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  showFieldErrors(details) {
    if (!Array.isArray(details)) {
        this.showError(JSON.stringify(details));
        return;
    }
    details.forEach(err => {
      const field = err.loc[err.loc.length - 1];
      const el = document.getElementById(`error-${field}`);
      if (el) el.textContent = err.msg;
    });
    this.showError("Please fix the validation errors below.");
  }

  clearErrors() {
    this.errorArea.style.display = "none";
    document.querySelectorAll(".field-error").forEach(el => el.textContent = "");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.sceneEditor = new SceneEditor();
});
