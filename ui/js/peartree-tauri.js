/**
 * peartree-tauri.js — Tauri platform adapter for peartree.
 *
 * Wires window.peartree.commands (the central registry) to Tauri's native
 * backend features:
 *   • Native file-open dialog       (pick_tree_file command)
 *   • File open via drag / dbl-click (open-file event)
 *   • Native menu → command dispatch  (menu-event event)
 *   • Native menu enabled-state sync  (set_menu_item_enabled invoke, via onStateChange)
 *
 * Loaded unconditionally from peartree.html; self-guards on window.__TAURI__
 * so it is silently inert when running in a plain browser.
 */

(async () => {
  if (!window.__TAURI__) return;

  // Wait for peartree to finish initialising (fires 'peartree-ready' event).
  await new Promise(resolve => {
    if (window.peartree) { resolve(); return; }
    window.addEventListener('peartree-ready', resolve, { once: true });
  });

  const { invoke } = window.__TAURI__.core;
  const { listen }  = window.__TAURI__.event;
  const app         = window.peartree;
  const registry    = app.commands;

  // ── File picker: native Tauri dialog ───────────────────────────────────
  // WKWebView blocks <input type="file"> clicks from async contexts, so we
  // override the default pickFile with a Rust command.
  app.pickFile = async () => {
    try {
      const result = await invoke('pick_tree_file');
      if (result) await app.loadTree(result.content, result.name);
    } catch (err) {
      console.error('pick_tree_file failed:', err);
    }
  };

  // ── Native menu enabled-state sync ────────────────────────────────────────
  // Subscribe to state changes from the JS command registry. Rust sets the
  // correct initial disabled states at launch; this handles all dynamic
  // changes thereafter (tree loaded, selection changed, etc.).
  registry.onStateChange((id, enabled) => {
    console.log('[tauri] set_menu_item_enabled', id, enabled);
    invoke('set_menu_item_enabled', { id, enabled })
      .catch(err => console.error('[tauri] set_menu_item_enabled failed', id, err));
  });

  // ── File opened via drag-to-icon / double-click / file association ─────────
  await listen('open-file', async (event) => {
    const filePath = event.payload;
    if (!filePath) return;
    try {
      const content = await invoke('read_file_content', { path: filePath });
      const name = filePath.split('/').pop() || 'tree';
      app.closeModal();
      await app.loadTree(content, name);
    } catch (err) {
      app.openModal();
      app.setModalError(err.message);
    }
  });

  // ── Native menu → command dispatch ───────────────────────────────────────
  // All menu items route through the registry so exec functions and enabled
  // guards are in one place.
  await listen('menu-event', ({ payload: id }) => {
    registry.execute(id);
  });
})();
