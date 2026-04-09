/**
 * peartree-embed.js
 *
 * Simplified API for embedding PearTree directly in a page.
 * Exposes a single global `PearTreeEmbed.embed(options)` function that
 * injects the complete PearTree viewer into a target container element.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────
 *
 *   <!-- 1. Load required stylesheets -->
 *   <link rel="stylesheet" href="css/bootstrap.min-artic.css" />
 *   <link rel="stylesheet" href="vendor/bootstrap-icons/bootstrap-icons.css" />
 *   <script src="vendor/marked.min.js"></script>
 *
 *   <!-- 2. Container element with explicit height -->
 *   <div id="my-tree" style="height:600px"></div>
 *
 *   <!-- 3. Load the embed API -->
 *   <script src="js/peartree-embed.js"></script>
 *
 *   <!-- 4. Initialise -->
 *   <script>
 *     PearTreeEmbed.embed({
 *       container: 'my-tree',        // element ID or HTMLElement
 *
 *       // ── Tree input: one of these two ──
 *       tree:    '((A:1,B:1):1);',   // inline Newick/NEXUS string
 *       // OR:
 *       treeUrl: 'data/my.tree',      // URL – fetched at runtime
 *
 *       filename: 'my.nwk',          // optional – used for format detection
 *
 *       // ── Appearance ──
 *       theme:  'dark',              // 'dark' | 'light'           (default: 'dark')
 *       height: '600px',             // CSS height string          (default: '600px')
 *                                    //   (ignored if container already has a height)
 *
 *       // ── Initial visual settings (mirrors the Palette panel) ──
 *       settings: {
 *         tipLabelShow: 'names',
 *         axisShow:     'time',
 *         // any key accepted by peartree.js initSettings
 *       },
 *
 *       // ── UI feature flags (all default to true) ──
 *       ui: {
 *         palette:   true,   // Visual Options panel + toggle button
 *         openTree:  false,  // Open / Import controls
 *         import:    false,  // same as openTree (alias)
 *         export:    true,   // Export tree / graphic buttons
 *         rtt:       false,  // Root-to-tip panel
 *         dataTable: false,  // Data table panel
 *         statusBar: true,   // Status bar
 *       },
 *
 *       // ── Palette sections (default: all) ──
 *       // Controls which sections appear in the Visual Options panel.
 *       // Pass 'all' or an array of section keys:
 *       //   'tree' | 'tipLabels' | 'labelShapes' | 'tipShapes' |
 *       //   'nodeShapes' | 'nodeLabels' | 'nodeBars' | 'collapsedClades' |
 *       //   'legend' | 'axis' | 'selectionHover' | 'rtt' | 'theme'
 *       paletteSections: ['tree', 'tipLabels', 'axis', 'theme'],
 *     });
 *   </script>
 *
 * ── Notes ─────────────────────────────────────────────────────────────────
 *   • Only ONE PearTree instance per page (DOM element IDs must be unique).
 *   • Settings are NEVER persisted to localStorage (storageKey is always null).
 *   • CSS is injected automatically; pass base: 'https://…/peartree/' to
 *     override the auto-detected asset root.
 */
(function () {
  'use strict';

  // ── Auto-detect the peartree asset root from this script's src ──────────
  // Convention: this file lives at <root>/js/peartree-embed.js, so the root
  // is one directory up.  Works for both relative and absolute src paths.
  const _scriptSrc = (document.currentScript || {}).src || '';
  const _scriptDir = _scriptSrc ? _scriptSrc.substring(0, _scriptSrc.lastIndexOf('/') + 1) : '';
  const _autoBase  = _scriptDir ? _scriptDir + '../' : '';

  // ── CSS stylesheet injection helper ────────────────────────────────────
  // Resolves href to an absolute URL so it matches both relative and
  // absolute hrefs already present in the document.
  function _ensureStylesheet(href) {
    const a = document.createElement('a');
    a.href = href;
    const abs = a.href;
    const existing = document.querySelectorAll('link[rel="stylesheet"]');
    for (let i = 0; i < existing.length; i++) {
      if (existing[i].href === abs) return;
    }
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = abs;
    document.head.appendChild(link);
  }

  // ── Script loader (returns a promise) ──────────────────────────────────
  function _loadScript(src, isModule) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      if (isModule) el.type = 'module';
      el.src = src;
      el.onload  = resolve;
      el.onerror = () => reject(new Error('peartree-embed: failed to load ' + src));
      document.head.appendChild(el);
    });
  }

  // ── Full canonical HTML template ────────────────────────────────────────
  // Sourced verbatim from peartree.html (body content, minus script tags).
  // All elements are always present; peartree.js hides the ones flagged off
  // via window.peartreeConfig.ui using the `d-none` CSS class.
  //
  // peartree-ui.js replaces the palette-panel-host placeholder using
  // peartreeConfig.paletteSections ('all' or an array of section keys).
  function _buildHTML() {
    return `
<nav class="pt-toolbar">
  <div class="pt-toolbar-left">
    <button id="btn-palette" class="btn btn-sm btn-outline-secondary" title="Visual options panel (Tab · ⌥Tab for advanced)"><i class="bi bi-sliders"></i><i class="bi bi-caret-right"></i></button>
    <div class="pt-toolbar-sep"></div>
    <button id="btn-open-tree" class="btn btn-sm btn-outline-primary" title="Open tree file (⌘O)"><i class="bi bi-folder2-open"></i></button>
    <button id="btn-import-annot" class="btn btn-sm btn-outline-success" disabled title="Import annotations from CSV/TSV (⌘⇧O)"><i class="bi bi-table"></i></button>
    <button id="btn-export-tree" class="btn btn-sm btn-outline-info" disabled title="Export tree (Newick or NEXUS)"><i class="bi bi-file-earmark-arrow-down"></i></button>
    <button id="btn-export-graphic" class="btn btn-sm btn-outline-warning" disabled title="Download graphic (SVG or PNG)"><i class="bi bi-image"></i></button>
    <div class="pt-toolbar-sep"></div>
  </div>
  <div class="pt-toolbar-center">
    <button id="btn-curate-annot" class="btn btn-sm btn-outline-secondary" disabled title="Curate annotations"><i class="bi bi-tags"></i></button>
    <button id="btn-node-info" class="btn btn-sm btn-outline-secondary" disabled title="Node info (⌘I)"><i class="bi bi-info-circle"></i></button>
    <div class="pt-toolbar-sep"></div>
    <div class="btn-group" role="group" aria-label="Navigate history">
      <button id="btn-back" class="btn btn-sm btn-outline-secondary" disabled title="Navigate back (⌘[)"><i class="bi bi-chevron-left"></i></button>
      <button id="btn-forward" class="btn btn-sm btn-outline-secondary" disabled title="Navigate forward (⌘])"><i class="bi bi-chevron-right"></i></button>
    </div>
    <div class="btn-group ms-1" role="group" aria-label="Navigate subtree">
      <button id="btn-drill" class="btn btn-sm btn-outline-secondary" disabled title="Drill into subtree (⌘⇧>)"><i class="bi bi-box-arrow-in-right"></i></button>
      <button id="btn-climb" class="btn btn-sm btn-outline-secondary" disabled title="Climb out one level (⌘⇧<)"><i class="bi bi-box-arrow-left"></i></button>
      <button id="btn-home" class="btn btn-sm btn-outline-secondary" disabled title="Navigate to root (⌘\\)"><i class="bi bi-house"></i></button>
    </div>
    <div class="pt-toolbar-sep"></div>
    <div class="btn-group" role="group" aria-label="Zoom">
      <button id="btn-zoom-in" class="btn btn-sm btn-outline-secondary" disabled title="Zoom in (⌘+)"><i class="bi bi-zoom-in"></i></button>
      <button id="btn-zoom-out" class="btn btn-sm btn-outline-secondary" disabled title="Zoom out (⌘−)"><i class="bi bi-zoom-out"></i></button>
    </div>
    <div class="btn-group" role="group" aria-label="Fit view">
      <button id="btn-fit" class="btn btn-sm btn-outline-secondary" disabled title="Fit all (⌘0)"><i class="bi bi-arrows-fullscreen"></i></button>
      <button id="btn-fit-labels" class="btn btn-sm btn-outline-secondary" disabled title="Fit labels (⌘⇧0)"><i class="bi bi-type"></i></button>
    </div>
    <div class="pt-toolbar-sep"></div>
    <div class="btn-group" role="group" aria-label="Branch order">
      <button id="btn-order-asc" class="btn btn-sm btn-outline-secondary" disabled title="Order branches ascending by clade size (⌘U)"><i class="bi bi-sort-up"></i></button>
      <button id="btn-order-desc" class="btn btn-sm btn-outline-secondary" disabled title="Order branches descending by clade size (⌘D)"><i class="bi bi-sort-up"></i></button>
    </div>
    <div class="btn-group" role="group" aria-label="Rotate node">
      <button id="btn-rotate" class="btn btn-sm btn-outline-secondary" disabled title="Rotate selected node"><i class="bi bi-repeat" style="display:inline-block;transform:rotate(90deg)"></i></button>
      <button id="btn-rotate-all" class="btn btn-sm btn-outline-secondary" disabled title="Rotate all nodes in subtree"><i class="bi bi-symmetry-horizontal" style="display:inline-block;transform:scaleX(-1)"></i></button>
    </div>
    <div class="pt-toolbar-sep"></div>
    <div id="reroot-controls">
      <div class="btn-group" role="group" aria-label="Selection mode">
        <button id="btn-mode-nodes" class="btn btn-sm btn-outline-secondary active" disabled title="Select nodes mode"><i class="bi bi-circle" style="display:inline-block;transform:rotate(-90deg)"></i></button>
        <button id="btn-mode-branches" class="btn btn-sm btn-outline-secondary" disabled title="Toggle branches/nodes mode (⌘B)"><i class="bi bi-dash-lg"></i></button>
      </div>
      <div class="pt-toolbar-sep"></div>
      <button id="btn-reroot" class="btn btn-sm btn-outline-secondary" disabled title="Reroot tree at selection"><i class="bi bi-reply-fill"></i></button>
      <button id="btn-midpoint-root" class="btn btn-sm btn-outline-secondary" disabled title="Midpoint root (⌘M)"><i class="bi bi-vr" style="display:inline-block;transform:rotate(90deg)"></i></button>
      <button id="btn-temporal-root-global" class="btn btn-sm btn-outline-secondary" disabled title="Global temporal root (⌘R)"><i class="bi bi-clock"></i></button>
      <button id="btn-temporal-root" class="btn btn-sm btn-outline-secondary" disabled title="Optimise root on current branch (⇧⌘R)"><i class="bi bi-clock-history"></i></button>
      <div class="pt-toolbar-sep"></div>
    </div>
    <div class="btn-group" role="group" aria-label="Hide/show subtree">
      <button id="btn-hide" class="btn btn-sm btn-outline-secondary" disabled title="Collapse selected subtree"><i class="bi bi-node-minus"></i></button>
      <button id="btn-show" class="btn btn-sm btn-outline-secondary" disabled title="Expand selected collapsed subtree"><i class="bi bi-node-plus"></i></button>
    </div>
    <div class="btn-group ms-1" role="group" aria-label="Collapse/expand clade">
      <button id="btn-collapse-clade" class="btn btn-sm btn-outline-secondary" disabled title="Collapse selected clade to triangle"><i class="bi bi-arrows-collapse"></i></button>
      <button id="btn-expand-clade" class="btn btn-sm btn-outline-secondary" disabled title="Expand collapsed clade triangle"><i class="bi bi-arrows-expand"></i></button>
    </div>
    <div class="pt-toolbar-sep"></div>
    <div class="pt-colour-pick-wrap" id="colour-pick-wrap">
      <button id="btn-colour-trigger" disabled title="Choose colour for selected nodes"><span id="btn-colour-trigger-swatch"></span></button>
      <input type="color" id="btn-node-colour" value="#ff8800" tabindex="-1">
      <div id="colour-picker-popup">
        <div class="pt-cp-native-row">
          <input type="color" id="btn-colour-native-open" value="#ff8800" title="Open colour picker…">
          <span style="font-size:0.75rem;color:var(--pt-text-status-sep);">Custom colour…</span>
        </div>
        <div id="colour-picker-recent-row" class="pt-cp-row">
          <span class="pt-cp-label">Recent</span>
          <div class="pt-cp-swatches" id="colour-picker-recent"></div>
        </div>
        <hr class="pt-cp-divider">
        <div id="colour-picker-palettes"></div>
      </div>
      <button id="btn-apply-user-colour" class="btn btn-sm btn-outline-secondary" disabled title="Apply colour to selected nodes"><i class="bi bi-brush"></i></button>
      <button id="btn-clear-user-colour" class="btn btn-sm btn-outline-secondary" disabled title="Clear all user colours"><i class="bi bi-eraser"></i></button>
    </div>
  </div>
  <div class="pt-toolbar-right">
    <div class="pt-toolbar-sep"></div>
    <div class="pt-filter-wrap">
      <div class="pt-filter-group">
        <input type="search" id="tip-filter" class="pt-filter-input" placeholder="Filter tips…" disabled autocomplete="off" spellcheck="false">
        <button id="btn-filter-regex" class="pt-filter-col-btn" disabled title="Use regular expression"><i class="bi bi-regex"></i></button>
        <div class="pt-filter-col-wrap">
          <button id="btn-filter-col" class="pt-filter-col-btn" disabled title="Search in: Name"><i class="bi bi-funnel"></i></button>
          <div id="filter-col-popup"></div>
        </div>
      </div>
      <span id="tip-filter-count" class="pt-filter-count" hidden></span>
    </div>
    <div class="pt-toolbar-sep"></div>
    <button id="btn-data-table" class="btn btn-sm btn-outline-secondary" disabled title="Data table panel"><i class="bi bi-caret-left"></i><i class="bi bi-layout-sidebar-reverse"></i></button>
    <button id="btn-rtt" class="btn btn-sm btn-outline-secondary" disabled title="Root-to-tip divergence plot"><i class="bi bi-caret-left"></i><i class="bi bi-graph-up-arrow"></i></button>
  </div>
</nav>

<div id="canvas-container">
  <canvas id="legend2-left-canvas" class="pt-legend-canvas"></canvas>
  <canvas id="legend-left-canvas" class="pt-legend-canvas"></canvas>
  <div id="canvas-and-axis-wrapper">
    <div id="canvas-wrapper">
      <div id="empty-state">
        <div style="text-align:center">
          <img src="img/peartree.png" class="pt-empty-icon" alt="PearTree">
          <p class="pt-empty-title">No tree loaded</p>
          <p class="pt-empty-hint" id="empty-state-hint">Drag a NEXUS or Newick file here</p>
          <p id="empty-state-error" style="display:none;color:var(--pt-red);font-size:0.85rem;margin:0.5rem 1rem 0"></p>
          <button class="btn btn-sm btn-outline-primary" id="empty-state-open-btn"><i class="bi bi-folder2-open me-1"></i>Open…</button>
          <button class="btn btn-sm btn-outline-secondary ms-2" id="empty-state-example-btn"><i class="bi bi-tree me-1"></i>Example…</button>
        </div>
      </div>
      <div id="loading" class="hidden"><div class="pt-spinner"></div><p id="loading-msg">Fetching tree file…</p></div>
      <div id="error"></div>
      <canvas id="tree-canvas"></canvas>
      <div id="tooltip"></div>
    </div>
    <canvas id="axis-canvas"></canvas>
  </div>
  <canvas id="legend-right-canvas" class="pt-legend-canvas right"></canvas>
  <canvas id="legend2-right-canvas" class="pt-legend-canvas right"></canvas>

  <div id="data-table-panel">
    <div id="data-table-resize-handle"></div>
    <div id="dt-num-col">
      <div id="dt-num-header">
        <button id="dt-btn-pin" title="Pin table"><i class="bi bi-pin-angle"></i></button>
        <button id="dt-btn-close" title="Close table"><i class="bi bi-x-lg"></i></button>
      </div>
      <div id="dt-num-body"></div>
    </div>
    <div id="dt-scroll-area">
      <div class="dt-header" id="dt-header"></div>
      <div class="dt-body" id="dt-body"></div>
    </div>
  </div>

  <div id="rtt-panel">
    <div id="rtt-resize-handle"></div>
    <div id="rtt-header">
      <button id="rtt-btn-pin" title="Pin panel open"><i class="bi bi-pin-angle"></i></button>
      <button id="rtt-btn-close" title="Close"><i class="bi bi-x-lg"></i></button>
      <span class="rtt-title"></span>
      <button id="rtt-btn-download" class="btn btn-sm btn-outline-info" title="Download RTT data as CSV"><i class="bi bi-download"></i></button>
      <button id="rtt-btn-image" class="btn btn-sm btn-outline-warning" title="Export plot as image"><i class="bi bi-image"></i></button>
      <button id="rtt-btn-stats" class="btn btn-sm btn-outline-secondary active" title="Show/hide statistics box"><i class="bi bi-info-circle"></i></button>
    </div>
    <canvas id="rtt-canvas"></canvas>
  </div>
</div>

<div id="status-bar">
  <a id="status-brand" href="https://github.com/artic-network/peartree" target="_blank" rel="noopener" title="PearTree on GitHub"><i class="bi bi-tree"></i>PearTree</a>
  <span id="status-stats"></span>
  <span id="status-select"></span>
  <span id="status-message"></span>
  <button id="btn-theme" title="Toggle light/dark mode"><i class="bi bi-sun"></i></button>
  <button id="btn-about" title="About PearTree"><i class="bi bi-info-circle"></i></button>
  <button id="btn-help" title="Help (⌘?)"><i class="bi bi-question-circle"></i></button>
</div>

<div id="open-tree-modal" class="pt-modal-overlay">
  <div class="pt-modal">
    <div class="pt-modal-header">
      <h5 class="modal-title"><i class="bi bi-folder2-open me-2"></i>Open Tree File</h5>
      <button class="pt-modal-close-btn" id="btn-modal-close" title="Close">&times;</button>
    </div>
    <div class="pt-modal-body">
      <div class="pt-tabs">
        <button class="pt-tab-btn active" data-tab="file"><i class="bi bi-folder2-open me-1"></i>File</button>
        <button class="pt-tab-btn" data-tab="url"><i class="bi bi-link-45deg me-1"></i>URL</button>
        <button class="pt-tab-btn" data-tab="example"><i class="bi bi-tree me-1"></i>Example</button>
      </div>
      <div class="pt-tab-panel active" id="tab-panel-file">
        <div id="tree-drop-zone" class="pt-drop-zone">
          <div class="pt-drop-icon"><i class="bi bi-file-earmark-arrow-down"></i></div>
          <p>Drag and drop your tree file here</p>
          <p class="text-secondary" style="font-size:0.8rem;margin-bottom:1rem">NEXUS (.nex, .nexus, .tre, .tree, .treefile) &nbsp;or&nbsp; Newick (.nwk, .newick)</p>
          <input type="file" id="tree-file-input" accept=".nex,.nexus,.tre,.tree,.treefile,.nwk,.newick,.txt" style="position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none">
          <button class="btn btn-sm btn-outline-primary" id="btn-file-choose"><i class="bi bi-folder2-open me-1"></i>Choose File</button>
        </div>
      </div>
      <div class="pt-tab-panel" id="tab-panel-url">
        <label class="form-label">Tree file URL</label>
        <input type="url" class="pt-modal-url-input" id="tree-url-input" placeholder="https://example.com/tree.nexus" />
        <div style="text-align:center">
          <button class="btn btn-sm btn-outline-primary" id="btn-load-url"><i class="bi bi-cloud-download me-1"></i>Load from URL</button>
        </div>
      </div>
      <div class="pt-tab-panel" id="tab-panel-example">
        <div class="pt-example-center">
          <p>Load the example <strong>Ebola virus (EBOV)</strong> phylogenetic tree<br/>from the 2014–2016 West Africa epidemic.</p>
          <button class="btn btn-sm btn-outline-success" id="btn-load-example"><i class="bi bi-tree me-1"></i>Load Example Data</button>
        </div>
      </div>
      <div class="pt-modal-loading" id="modal-loading" style="display:none"><div class="pt-spinner"></div>Loading&hellip;</div>
      <div class="pt-modal-error" id="modal-error" style="display:none"></div>
    </div>
  </div>
</div>

<div id="error-dialog-overlay">
  <div id="error-dialog">
    <h6><i class="bi bi-exclamation-triangle-fill"></i>Could not open file</h6>
    <p id="error-dialog-msg"></p>
    <button id="error-dialog-ok" class="btn btn-sm btn-primary">OK</button>
    <div style="clear:both"></div>
  </div>
</div>

<div id="confirm-dialog-overlay">
  <div id="confirm-dialog">
    <h6><i class="bi bi-exclamation-triangle"></i><span id="confirm-dialog-title">Warning</span></h6>
    <p id="confirm-dialog-msg"></p>
    <div id="confirm-dialog-footer">
      <button id="confirm-dialog-cancel" class="btn btn-sm btn-outline-secondary">Cancel</button>
      <button id="confirm-dialog-ok" class="btn btn-sm btn-primary">OK</button>
    </div>
  </div>
</div>

<div id="curate-annot-overlay" class="pt-modal-overlay">
  <div class="pt-modal" style="width:800px;max-width:calc(100vw - 24px);min-width:min(760px,calc(100vw - 24px))">
    <div class="pt-modal-header">
      <h5 class="modal-title"><i class="bi bi-tags me-2"></i>Annotations</h5>
      <button class="pt-modal-close-btn" id="curate-annot-close" title="Close">&times;</button>
    </div>
    <div class="pt-modal-body" style="padding:0;display:flex;flex-direction:column">
      <div class="ca-table-wrap">
        <table class="ca-table">
          <thead><tr>
            <th>Annotation</th><th>Type</th><th>On</th>
            <th>Observed range</th><th>Scale bounds</th>
            <th title="Show column in data table panel" style="width:36px;text-align:center"><i class="bi bi-layout-sidebar-reverse" style="font-size:0.8rem"></i></th>
            <th style="width:32px"></th>
          </tr></thead>
          <tbody id="curate-annot-tbody"></tbody>
        </table>
      </div>
      <div id="curate-annot-detail" class="ca-detail">
        <p class="ca-detail-empty">← Select an annotation row to edit its settings</p>
      </div>
    </div>
    <div class="pt-modal-footer">
      <button id="curate-annot-parse-tips" class="btn btn-sm btn-outline-secondary me-auto"><i class="bi bi-scissors me-1"></i>Parse Tips</button>
      <button id="curate-annot-cancel" class="btn btn-sm btn-secondary">Cancel</button>
      <button id="curate-annot-apply" class="btn btn-sm btn-primary">Apply</button>
    </div>
  </div>
</div>

<div id="parse-tips-overlay" class="pt-modal-overlay" style="z-index:1060">
  <div class="pt-modal" style="width:460px;max-width:calc(100vw - 40px)">
    <div class="pt-modal-header">
      <h5 class="modal-title"><i class="bi bi-scissors me-2"></i>Parse Tip Names</h5>
      <button class="pt-modal-close-btn" id="parse-tips-close" title="Close">&times;</button>
    </div>
    <div class="pt-modal-body">
      <p style="font-size:0.82rem;color:var(--pt-text-subdued);margin-bottom:14px">Extract an annotation from tip names by splitting on a delimiter.</p>
      <div class="ca-row" style="margin-bottom:10px"><label class="ca-row-lbl" style="width:80px">Name</label><input type="text" id="parse-tips-name" class="ca-num-input" style="flex:1;width:auto" placeholder="annotation name"></div>
      <div class="ca-row" style="margin-bottom:10px"><label class="ca-row-lbl" style="width:80px">Delimiter</label><input type="text" id="parse-tips-delim" class="ca-num-input" style="width:70px;font-family:monospace" value="|" placeholder="|"><span class="ca-hint" style="margin-left:8px">character(s) used to split tip names into fields</span></div>
      <div class="ca-row" style="margin-bottom:10px"><label class="ca-row-lbl" style="width:80px">Field</label><input type="number" id="parse-tips-field" class="ca-num-input" style="width:70px" value="1" step="1"><span class="ca-hint" style="margin-left:8px">1 = first &middot; −1 = last</span></div>
      <div class="ca-row" style="margin-bottom:10px"><label class="ca-row-lbl" style="width:80px">Type</label><select id="parse-tips-type" class="ca-sel"><option value="auto">Auto-detect</option><option value="categorical">Categorical</option><option value="integer">Integer</option><option value="real">Real</option><option value="date">Date</option></select></div>
      <div class="ca-row" style="margin-bottom:10px"><label class="ca-row-lbl" style="width:80px">Missing</label><input type="text" id="parse-tips-missing" class="ca-num-input" style="width:70px" value="?" placeholder="none"><span class="ca-hint" style="margin-left:8px">field value treated as missing data</span></div>
      <p id="parse-tips-error" class="ca-warn" style="display:none;margin-top:8px"></p>
      <div id="parse-tips-examples" style="margin-top:14px;display:none">
        <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--pt-text-muted);margin-bottom:6px">Example tip labels</div>
        <div id="parse-tips-examples-list" style="font-family:monospace;font-size:0.78rem;color:var(--pt-text-bright);line-height:1.7"></div>
      </div>
    </div>
    <div class="pt-modal-footer">
      <button id="parse-tips-cancel" class="btn btn-sm btn-secondary">Cancel</button>
      <button id="parse-tips-ok" class="btn btn-sm btn-primary">Add Annotation</button>
    </div>
  </div>
</div>

<div id="import-annot-overlay" class="pt-modal-overlay">
  <div class="pt-modal">
    <div class="pt-modal-header">
      <h5 class="modal-title" id="import-annot-title"><i class="bi bi-file-earmark-plus me-2"></i>Import Annotations</h5>
      <button class="pt-modal-close-btn" id="import-annot-close" title="Close">&times;</button>
    </div>
    <div class="pt-modal-body" id="import-annot-body"></div>
    <div id="import-annot-footer" class="pt-modal-footer"></div>
  </div>
</div>

<div id="export-tree-overlay" class="pt-modal-overlay">
  <div class="pt-modal">
    <div class="pt-modal-header">
      <h5 class="modal-title" id="export-tree-title"><i class="bi bi-file-earmark-arrow-down me-2"></i>Export Tree</h5>
      <button class="pt-modal-close-btn" id="export-tree-close" title="Close">&times;</button>
    </div>
    <div class="pt-modal-body" id="export-tree-body"></div>
    <div id="export-tree-footer" class="pt-modal-footer"></div>
  </div>
</div>

<div id="export-graphic-overlay" class="pt-modal-overlay">
  <div class="pt-modal">
    <div class="pt-modal-header">
      <h5 class="modal-title"><i class="bi bi-image me-2"></i>Export Graphic</h5>
      <button class="pt-modal-close-btn" id="export-graphic-close" title="Close">&times;</button>
    </div>
    <div class="pt-modal-body" id="export-graphic-body"></div>
    <div id="export-graphic-footer" class="pt-modal-footer"></div>
  </div>
</div>

<div id="rtt-image-overlay" class="pt-modal-overlay">
  <div class="pt-modal">
    <div class="pt-modal-header">
      <h5 class="modal-title"><i class="bi bi-image me-2"></i>Export Plot Image</h5>
      <button class="pt-modal-close-btn" id="rtt-image-close" title="Close">&times;</button>
    </div>
    <div class="pt-modal-body" id="rtt-image-body"></div>
    <div id="rtt-image-footer" class="pt-modal-footer"></div>
  </div>
</div>

<div id="node-info-overlay" class="pt-modal-overlay">
  <div class="pt-modal">
    <div class="pt-modal-header">
      <h5 id="node-info-title" class="modal-title"></h5>
      <button id="node-info-close" class="pt-modal-close-btn" title="Close">&times;</button>
    </div>
    <div id="node-info-body" class="pt-modal-body"></div>
  </div>
</div>

<!-- palette panel injected by peartree-ui.js -->
<div id="palette-panel-host"></div>

<div id="help-panel">
  <div id="help-panel-header">
    <h2>PearTree Help</h2>
    <button id="btn-help-close" title="Close help">&times;</button>
  </div>
  <div id="help-panel-body">
    <div class="help-md" id="help-content"><p style="opacity:0.5">Loading…</p></div>
  </div>
</div>

<div id="about-backdrop"></div>
<div id="about-panel">
  <div id="about-panel-header">
    <h2><i class="bi bi-tree me-2"></i>About PearTree</h2>
    <button id="btn-about-close" title="Close">&times;</button>
  </div>
  <div id="about-panel-body">
    <div class="help-md" id="about-content"><p style="opacity:0.5">Loading…</p></div>
  </div>
</div>`;
  }

  // ── Main embed function ─────────────────────────────────────────────────
  function embed(options) {
    if (!options) throw new Error('peartree-embed: options object is required');

    // Resolve container element
    const container = typeof options.container === 'string'
      ? document.getElementById(options.container)
      : options.container;
    if (!container) throw new Error('peartree-embed: container element not found: ' + options.container);

    // Base path for assets (default: auto-detected from this script's location)
    const base = typeof options.base === 'string' ? options.base : _autoBase;

    // Merge ui flags (all default true)
    const ui = Object.assign({
      palette:   true,
      openTree:  true,
      import:    true,
      export:    true,
      rtt:       true,
      dataTable: true,
      statusBar: true,
    }, options.ui || {});
    // `openTree` and `import` are aliases for the same flag.
    if (ui.openTree === false) ui.import = false;
    if (ui.import   === false) ui.openTree = false;

    // Set window.peartreeConfig BEFORE injecting HTML (peartree.js reads it
    // synchronously at module-parse time using the d-none class trick).
    window.peartreeConfig = {
      ui: {
        palette:   ui.palette,
        openTree:  ui.openTree,
        rtt:       ui.rtt,
        dataTable: ui.dataTable,
        import:    ui.import,
        export:    ui.export,
        statusBar: ui.statusBar,
        theme:     options.theme || 'dark',
      },
      // null = never persist settings to localStorage for embedded viewers
      storageKey: null,
      // `settings` is the key peartree.js reads (maps to internal initSettings)
      settings: options.settings || {},
      // paletteSections controls which sections peartree-ui.js builds into the panel
      paletteSections: options.paletteSections || 'all',
    };

    // Inject peartree CSS (no-op if already present)
    _ensureStylesheet(base + 'css/peartree.css');
    _ensureStylesheet(base + 'css/peartree-embed.css');

    // Build the wrapper and inject HTML
    const height = options.height || '600px';
    const theme  = options.theme  || 'dark';
    const wrap = document.createElement('div');
    wrap.className = 'pt-embed-wrap';
    wrap.setAttribute('data-bs-theme', theme);
    wrap.style.height = height;
    wrap.innerHTML = _buildHTML();
    container.appendChild(wrap);

    // Load scripts in dependency order:
    //   marked.min.js  → peartree-ui.js (builds palette panel) → peartree.js
    _loadScript(base + 'vendor/marked.min.js', false).then(() => {
      return _loadScript(base + 'js/peartree-ui.js', false);
    }).then(() => {
      // Load peartree.js (module) after UI helpers are ready
      return _loadScript(base + 'js/peartree.js', true);
    }).then(() => {
      // Dispatch the tree once peartree engine has fired peartree-ready
      function _dispatchTree() {
        if (typeof options.tree === 'string') {
          window.dispatchEvent(new MessageEvent('message', {
            data:   {
              type:     'pt:loadTree',
              text:     options.tree,
              filename: options.filename || 'tree.nwk',
            },
            origin: window.location.origin,
          }));
        } else if (typeof options.treeUrl === 'string') {
          window.dispatchEvent(new MessageEvent('message', {
            data:   {
              type:     'pt:loadTree',
              url:      options.treeUrl,
              filename: options.filename || options.treeUrl.split('/').pop() || 'tree',
            },
            origin: window.location.origin,
          }));
        }
      }

      // peartree-ready may already have fired during script load (unlikely but safe)
      if (window.peartree) {
        _dispatchTree();
      } else {
        window.addEventListener('peartree-ready', _dispatchTree, { once: true });
      }
    }).catch(err => {
      console.error(err);
    });
  }

  // ── Expose public API ───────────────────────────────────────────────────
  window.PearTreeEmbed = { embed };
})();
