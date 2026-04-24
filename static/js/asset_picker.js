/**
 * AssetPicker component for selecting image and video assets.
 */
class AssetPicker {
  constructor() {
    this.cache = {
      image: null,
      video: null
    };
    this.modal = null;
    this.currentPlayingVideo = null;
    this.resolve = null;
    this.reject = null;
    this.lastFocusedElement = null;

    this._createModal();
  }

  /**
   * Create the modal DOM structure.
   */
  _createModal() {
    this.modal = document.createElement("div");
    this.modal.className = "asset-picker-modal is-hidden";
    this.modal.setAttribute("role", "dialog");
    this.modal.setAttribute("aria-modal", "true");
    this.modal.setAttribute("aria-label", "Select an asset");
    this.modal.innerHTML = `
      <div class="asset-picker-content">
        <div class="asset-picker-header">
          <div class="asset-picker-tabs">
            <button type="button" class="asset-tab active" data-kind="all">All</button>
            <button type="button" class="asset-tab" data-kind="image">Images</button>
            <button type="button" class="asset-tab" data-kind="video">Videos</button>
          </div>
          <div class="asset-picker-search">
            <input type="text" placeholder="Search assets..." aria-label="Search assets">
          </div>
          <button type="button" class="asset-picker-close" aria-label="Close modal">&times;</button>
        </div>
        <div class="asset-picker-grid">
          <div class="asset-picker-loading">Loading assets...</div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    this.grid = this.modal.querySelector(".asset-picker-grid");
    this.searchInput = this.modal.querySelector(".asset-picker-search input");
    this.closeBtn = this.modal.querySelector(".asset-picker-close");
    this.tabs = this.modal.querySelectorAll(".asset-tab");

    this.closeBtn.addEventListener("click", () => this.close());
    this.searchInput.addEventListener("input", () => this._renderGrid());
    
    this.tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        this.tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        this._renderGrid();
      });
    });

    this.modal.addEventListener("click", (e) => {
      if (e.target === this.modal) this.close();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.modal.classList.contains("is-hidden")) {
        this.close();
      }
      if (e.key === "Tab" && !this.modal.classList.contains("is-hidden")) {
        this._handleFocusTrap(e);
      }
    });
  }

  _handleFocusTrap(e) {
    const focusableElements = this.modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  }

  /**
   * Fetch assets from the API.
   */
  async _fetchAssets() {
    if (!this.cache.image) {
      const res = await fetch("/api/assets/images");
      this.cache.image = await res.json();
    }
    if (!this.cache.video) {
      const res = await fetch("/api/assets/videos");
      this.cache.video = await res.json();
    }
  }

  /**
   * Open the asset picker.
   * 
   * Args:
   *   options: { kind: "image" | "video" | "any" }
   * 
   * Returns:
   *   A promise that resolves with the selected asset or rejects if closed.
   */
  async open(options = { kind: "any" }) {
    this.lastFocusedElement = document.activeElement;
    this.currentKindFilter = options.kind;
    
    // Show/hide tabs based on kind
    const tabContainer = this.modal.querySelector(".asset-picker-tabs");
    if (this.currentKindFilter === "any") {
      tabContainer.style.display = "flex";
    } else {
      tabContainer.style.display = "none";
    }

    this.modal.classList.remove("is-hidden");
    this.searchInput.value = "";
    this.grid.innerHTML = '<div class="asset-picker-loading">Loading assets...</div>';
    
    this.searchInput.focus();

    try {
      await this._fetchAssets();
      this._renderGrid();
    } catch (err) {
      this.grid.innerHTML = `<div class="asset-picker-error">Error loading assets: ${err.message}</div>`;
    }

    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  _renderGrid() {
    const searchTerm = this.searchInput.value.toLowerCase();
    const activeTab = this.modal.querySelector(".asset-tab.active").dataset.kind;
    
    let assets = [];
    if (this.currentKindFilter === "image") {
      assets = this.cache.image;
    } else if (this.currentKindFilter === "video") {
      assets = this.cache.video;
    } else {
      if (activeTab === "all") {
        assets = [...this.cache.image, ...this.cache.video];
      } else if (activeTab === "image") {
        assets = this.cache.image;
      } else {
        assets = this.cache.video;
      }
    }

    assets.sort((a, b) => a.name.localeCompare(b.name));

    const filtered = assets.filter(a => a.name.toLowerCase().includes(searchTerm));

    this.grid.innerHTML = "";
    if (filtered.length === 0) {
      this.grid.innerHTML = '<div class="asset-picker-empty">No assets found.</div>';
      return;
    }

    filtered.forEach(asset => {
      const tile = document.createElement("div");
      tile.className = "asset-tile";
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", `Select ${asset.name}`);

      if (asset.kind === "image") {
        tile.innerHTML = `
          <div class="asset-preview">
            <img src="${asset.url}" loading="lazy" alt="">
          </div>
          <div class="asset-name" title="${asset.name}">${asset.name}</div>
        `;
      } else {
        tile.innerHTML = `
          <div class="asset-preview">
            <video src="${asset.url}" muted preload="metadata" playsinline loop></video>
          </div>
          <div class="asset-name" title="${asset.name}">${asset.name}</div>
        `;
        const video = tile.querySelector("video");
        tile.addEventListener("mouseenter", () => {
          if (this.currentPlayingVideo && this.currentPlayingVideo !== video) {
            this.currentPlayingVideo.pause();
            this.currentPlayingVideo.currentTime = 0;
          }
          video.play().catch(() => {});
          this.currentPlayingVideo = video;
        });
        tile.addEventListener("mouseleave", () => {
          video.pause();
          video.currentTime = 0;
          if (this.currentPlayingVideo === video) {
            this.currentPlayingVideo = null;
          }
        });
      }

      tile.addEventListener("click", () => {
        this.resolve(asset);
        this.close();
      });

      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.resolve(asset);
          this.close();
        }
      });

      this.grid.appendChild(tile);
    });
  }

  close() {
    this.modal.classList.add("is-hidden");
    if (this.currentPlayingVideo) {
      this.currentPlayingVideo.pause();
      this.currentPlayingVideo = null;
    }
    if (this.reject) {
      this.reject(new Error("Picker closed"));
      this.reject = null;
    }
    if (this.lastFocusedElement) {
      this.lastFocusedElement.focus();
    }
  }
}

// Global instance
window.assetPicker = new AssetPicker();

/**
 * Convenience function to open the picker.
 */
function openAssetPicker(options) {
  return window.assetPicker.open(options);
}
