# Paracosm

<img width="800" height="450" alt="Paracosm" src="https://github.com/user-attachments/assets/d10ce075-636b-4152-a2ab-cfd6af7d4f12" />

Paracosm is a local web application for running a TTRPG table with immersive visuals and audio.

It is designed around two browser views:

- **Display page**: a read-only output view intended for streaming to Discord or showing on a second screen
- **GM page**: the control surface used by the Game Master to edit the desired session state and sync it to the backend

The goal is to keep the experience lightweight, flexible, and easy to use during a session while still supporting rich atmosphere through scene visuals and audio playback.

Paracosm allows the configuration of:
- scene backgrounds
- layered visuals
- ambience playback
- music playback
- art handouts (temporary overlays)
- transition effects
- future audio/visual syncing

<img width="800" height="450" alt="Paracosm GM" src="https://github.com/user-attachments/assets/d628552e-1731-4507-aa55-e6c601c9f9f4" />

## Current architecture

The application uses:

- **FastAPI** for the backend
- **Jinja2 templates** for server-rendered pages
- **JavaScript** for frontend interaction
- **SSE** for pushing live updates from the GM page to the display page
- **Pydantic** models for state and request/response schemas

### Main components

- `app/main.py`  
  Creates the FastAPI app, initializes shared state, and mounts static assets.

- `app/web/routes.py`  
  Defines the HTML pages, API endpoints, and SSE event stream.

- `app/models/state.py`  
  Holds the live application state shared between GM and display.

- `app/models/library.py`  
  Defines the discovered media library structures.

- `app/services/audio_service.py`  
  Scans audio folders and builds the music/ambience library.

- `app/services/art_service.py`  
  Scans the art folder and builds the art handouts library.

- `app/services/scene_service.py`  
  Loads scene definitions from JSON and resolves asset paths.

- `app/services/event_service.py`  
  Broadcasts SSE updates to connected clients.

- `static/js/gm.js`  
  Handles the GM control flow and sends the full state to the backend.

- `static/js/display.js`  
  Bootstraps the display page and forwards state to the scene engine and audio engine.

- `static/js/scene_engine.js`  
  Reconciles the desired scene state and handles transitions.

- `static/js/audio_engine.js`  
  Reconciles music and ambience playback using the Web Audio API.

- `static/js/art_engine.js`  
  Reconciles art handout overlays on the display page.

## Asset structure

Assets are stored under `static/assets/`:

- `static/assets/audio/`
  - `music/`
  - `ambience/`

- `static/assets/art/`
  - Art files can be placed in subfolders to be grouped by category.

- `static/assets/images/`
- `static/assets/video/`
- `static/assets/scenes/`

### Scene editor Happy Path Smoke Test
1. **Create**: 
   - Click `+ New Scene`.
   - Enter Name: `Smoke Test`, ID: `smoke-test`, Background: `gate.jpg`.
   - Layers (paste): `[{"src": "wind.webm", "type": "video", "opacity": 0.5}]`.
   - Press `Ctrl+S` or click `Save`.
   - Verify `smoke-test` appears in the list.
2. **Edit**:
   - Click `Edit` on `smoke-test`.
   - Change Name to `Smoke Test Updated`.
   - Verify dirty indicator (`*`) appears.
   - Click `Save`.
   - Verify the name is updated in the list.
3. **Delete**:
   - Click `Delete` on `smoke-test`.
   - Confirm the dialog.
   - Verify `smoke-test` is gone from the list.
