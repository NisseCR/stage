/**
 * Dedicated preview script for the pop-out preview window.
 */
async function initPreview() {
  const container = document.getElementById("scene-stage");
  const emptyState = document.getElementById("preview-empty");
  const engine = new SceneEngine({ container });

  const channel = new BroadcastChannel("paracosm-editor-preview");

  channel.addEventListener("message", (event) => {
    if (event.data?.type === "scene") {
      engine.renderScene(event.data.scene);
      if (emptyState) {
        emptyState.classList.add("is-hidden");
      }
    }
  });

  // Ask the editor to send the current state right away.
  channel.postMessage({ type: "request-state" });

  window.addEventListener("beforeunload", () => channel.close());
}

document.addEventListener("DOMContentLoaded", initPreview);
