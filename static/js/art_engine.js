/**
 * ArtEngine handles the display of art handouts on the Display page.
 */
class ArtEngine {
  constructor(options) {
    this.overlay = options.overlay; // The overlay container element
    this.image = options.image;     // The img element within the overlay
    this.artMap = options.artMap || new Map();
    this.currentArtId = null;
    this.visible = false;
    this.isUnlocked = false;
    this.pendingArtState = null;
    
    // Reference to the main display container to apply blur/dim
    this.displayPage = document.querySelector(".display-page");
  }

  /**
   * Set whether the display is unlocked by a user gesture.
   * 
   * @param {boolean} isUnlocked 
   */
  setUnlocked(isUnlocked) {
    this.isUnlocked = Boolean(isUnlocked);
    if (this.pendingArtState) {
      this.reconcile(this.pendingArtState);
    }
  }

  /**
   * Reconcile the desired art state with the current DOM.
   * 
   * @param {Object} artState - The art state from the backend { visible, art_id }
   */
  reconcile(artState) {
    this.pendingArtState = artState;

    if (!this.isUnlocked) {
      this.hide();
      return;
    }

    if (!artState || !artState.visible || !artState.art_id) {
      this.hide();
      return;
    }

    this.show(artState.art_id);
  }

  /**
   * Show a specific art handout.
   * 
   * @param {string} artId 
   */
  show(artId) {
    const artItem = this.artMap.get(artId);
    if (!artItem) {
      console.warn("Art item not found in library:", artId);
      this.hide();
      return;
    }

    if (this.currentArtId === artId && this.visible) {
      return; // Already showing this art
    }

    console.log("Showing art handout:", artItem.name);
    
    this.image.src = artItem.src;
    this.image.alt = artItem.name;
    
    this.overlay.classList.remove("is-hidden");
    // Trigger entrance animation
    this.overlay.classList.add("is-visible");
    
    // Apply blur/dim to the background
    if (this.displayPage) {
      this.displayPage.classList.add("art-overlay-active");
    }

    this.currentArtId = artId;
    this.visible = true;
  }

  /**
   * Hide the current art handout.
   */
  hide() {
    if (!this.visible && this.overlay.classList.contains("is-hidden")) {
        return;
    }

    this.overlay.classList.remove("is-visible");
    this.overlay.classList.add("is-hidden");
    
    if (this.displayPage) {
      this.displayPage.classList.remove("art-overlay-active");
    }

    this.currentArtId = null;
    this.visible = false;
    // Don't clear src immediately to avoid flicker during fade out if any, 
    // but here we just hide it.
  }
}
