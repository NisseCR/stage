/**
 * Initialize the display page behavior.
 *
 * This page is a read-only listener that receives live updates from the backend
 * via SSE and will eventually render the active scene and audio state.
 */
function initDisplayPage() {
  const eventSource = new EventSource("/events");

  eventSource.addEventListener("state_snapshot", (event) => {
    const data = JSON.parse(event.data);
    console.log("Initial state snapshot received:", data);
  });

  eventSource.addEventListener("scene_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Scene changed:", data);
  });

  eventSource.addEventListener("music_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Music changed:", data);
  });

  eventSource.addEventListener("ambience_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Ambience changed:", data);
  });

  eventSource.addEventListener("fade_settings_changed", (event) => {
    const data = JSON.parse(event.data);
    console.log("Fade settings changed:", data);
  });

  eventSource.onerror = () => {
    console.warn("Display SSE connection lost. Browser will retry automatically.");
  };

  console.log("Display page loaded");
}

document.addEventListener("DOMContentLoaded", initDisplayPage);