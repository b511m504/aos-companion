# RebuildApp Architecture Guide

## Overall Philosophy

This project is a learning-first rebuild of the app architecture.

- Rebuild intentionally, not quickly.
- Understand every layer before adding complexity.
- Avoid AI patch accumulation that creates code you do not fully understand.
- Start with small, understandable systems, then scale.

The goal is not feature completeness. The goal is architectural clarity.

## Folder Responsibilities

- `src/state/`  
  Holds global app state and state update functions. This is the single source of truth for UI decisions.

- `src/screens/`  
  Contains screen-level rendering modules (`Home`, `Assign`, `Game`, `Settings`) and routing-by-state behavior.

- `src/components/`  
  Reusable UI pieces shared across screens (for example, navigation buttons).

- `src/services/`  
  Pure app logic and formatting helpers that do not directly touch the DOM.

- `src/hardware/`  
  Boundary for platform/device integration (Capacitor plugins, NFC, sensors) so hardware concerns stay isolated.

## Core Render Cycle

The app uses a manual render loop:

1. A state change occurs in the store.
2. `render()` is triggered by store subscribers.
3. The DOM is rebuilt from current state.
4. Event listeners are reconnected to the new DOM nodes.

This explicit loop is intentionally simple so you can trace UI behavior end-to-end.

## App Flow

High-level execution flow:

`main.js`  
-> initializes app + subscribes to store updates  
-> calls render pipeline (`renderNav`, `renderScreen`)  
-> screen modules return HTML based on active state

In practice:

- `main.js` orchestrates lifecycle.
- `state/store.js` controls state updates and notifications.
- render pipeline builds the current UI from state.
- `screens/*` contains screen-specific view logic.

## Development Rules

- Build one feature at a time.
- Isolate bugs before adding new behavior.
- Avoid giant files; split by responsibility early.
- Use `console.log` freely while learning and tracing flow.
- Test after every small change.

## Planned Build Order

Phase 1: navigation + state  
Phase 2: army data  
Phase 3: assignments  
Phase 4: NFC integration  
Phase 5: runtime gameplay

## Important Concept: Why App Mode / State Is Central

Most UI bugs come from unclear ownership of "what state the app is in."
When app mode and shared state are explicit, each screen knows when it should render, what inputs it should respond to, and what transitions are valid.

Centralized state management reduces hidden coupling, prevents conflicting UI behavior, and makes bugs reproducible. If state is predictable, render behavior becomes predictable.

## First Exercises

These exercises are intentionally tiny. Complete them in order before adding real app complexity.

### Exercise 1 - Counter State

**Goal**  
Add a `counter` value to global state, add increment/decrement buttons, and rerender the count when buttons are pressed.

**Concepts learned**  
Single source of truth, state mutation through store methods, and manual rerender trigger behavior.

**Expected render flow**  
Button click -> store updates `counter` -> store notifies subscribers -> `render()` runs -> DOM shows new count -> listeners reconnect.

**Common beginner mistakes**

- Mutating state directly in UI code instead of through store functions.
- Updating state but forgetting to notify subscribers.
- Binding event listeners once and assuming they survive full rerenders.

**Debugging tips (`console.log`)**

- Log in click handlers (`increment clicked`, `decrement clicked`).
- Log inside store update function (previous + next counter values).
- Log at top of `render()` to verify rerender frequency.

### Exercise 2 - Theme Toggle

**Goal**  
Add `theme` state (`light`/`dark`) and toggle a CSS class during render based on that state.

**Concepts learned**  
UI should derive from state, not from ad-hoc DOM mutations.

**Expected render flow**  
Toggle click -> store updates `theme` -> `render()` runs -> root class reflects theme -> styles update from CSS.

**Common beginner mistakes**

- Toggling classes directly in event handlers without storing theme in state.
- Keeping separate "theme flags" in multiple files.
- Forgetting to render from state after toggling.

**Debugging tips (`console.log`)**

- Log old/new theme inside store update.
- Log current theme at render start.
- Log the applied root class after render to confirm state-to-UI mapping.

### Exercise 3 - Screen Persistence

**Goal**  
Save current screen key to `localStorage` and restore it on app startup.

**Concepts learned**  
Difference between runtime state (in-memory store) and persistence layer (`localStorage` as durable storage).

**Expected render flow**  
Screen change -> store updates `activeScreen` -> persist key -> `render()` updates UI.  
App reload -> read persisted key -> initialize store with that value -> first `render()` shows restored screen.

**Common beginner mistakes**

- Reading from `localStorage` after first render instead of during initialization.
- Writing invalid screen keys and breaking navigation.
- Coupling persistence calls directly to screen components.

**Debugging tips (`console.log`)**

- Log every persist write (`saving activeScreen=...`).
- Log startup restore (`restored activeScreen=...` or fallback path).
- Log invalid storage values and fallback behavior.
