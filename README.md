# Immersion

Immersion is a local web application for running a D&D table with immersive visuals and audio.

It is designed around two browser views:

- **GM page**: the control surface used by the Game Master to edit the desired session state and sync it to the backend
- **Display page**: a read-only output view intended for streaming to Discord or showing on a second screen

The goal is to keep the experience lightweight, flexible, and easy to use during a session while still supporting rich atmosphere through scene visuals and audio playback.

## Project context

This project is intended for tabletop roleplaying games, especially Dungeons & Dragons sessions.  
The GM uses the control interface to drive the current state, while the display page shows the immersive output for players or stream viewers.

The display is meant to support:
- scene backgrounds
- layered visuals
- ambience playback
- music playback
- transition effects
- future audio/visual syncing

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

## Asset structure

Assets are stored under `static/assets/` and grouped by type for clarity:

- `static/assets/audio/`
  - `music/`
  - `ambience/`

- `static/assets/images/`
- `static/assets/video/`
- `static/assets/scenes/`

This structure keeps the project organized and makes future asset management easier.

## Current features

- GM and display pages are available
- Live backend state is shared through a single source of truth
- GM edits are synced through one endpoint
- Display page listens for updates via SSE
- Scene definitions are loaded from JSON
- Music and ambience libraries are discovered from the filesystem
- Static assets are served by FastAPI
- Music and ambience playback use Web Audio reconciliation with fades

## Current state model

The application currently tracks:

- active scene
- selected music playlist
- active ambience items
- fade settings

This structure is designed to support future visual and audio playback logic without needing a major refactor.

## What is already working

- application startup and routing
- HTML templates for GM and display pages
- SSE event delivery from backend to display
- GM control flow wired to backend state changes
- basic rendering of current state in both pages
- asset scanning for scenes and audio libraries
- Web Audio playback with fade-based reconciliation

## Roadmap

The next development steps are:

### 1. GM UI completion
Add the remaining control components needed to fully manage session state:
- scene selection
- playlist selection
- ambience toggles
- fade duration controls

### 2. Display page rendering
Continue refining the visual rendering layer:
- background scene rendering
- layered image/video support
- active scene transitions
- live state summaries as needed

### 3. Audio engine polish
Refine playback behavior for:
- music crossfades on playlist changes
- ambience fades on add/remove changes
- smoother handling of edge cases and retries

### 4. Visual polish
Add styling and layout improvements once the control flow is stable.

### 5. Session behavior refinements
Future improvements may include:
- smoother transitions
- scene layering rules
- pause/resume logic
- configurable defaults
- more advanced display effects

## Development approach

The project is being built in stages:

1. establish the shared data model
2. connect GM actions to backend state
3. propagate changes to the display via SSE
4. build the display rendering layer
5. add audio playback and immersive effects
6. refine the UI and polish the experience

This keeps the codebase maintainable and makes it easier to verify that each layer works before moving to the next.

## Notes

This project is intended for local use on a single machine, with the GM controlling the display page in real time.  
The current architecture is intentionally simple so it can grow cleanly as more immersive features are added.