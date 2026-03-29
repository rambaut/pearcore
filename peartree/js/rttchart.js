// rttchart.js — Root-to-Tip panel controller.
//
// Manages the slide-out RTT panel lifecycle (open/close/pin, resize-handle
// drag) and keeps the RTTRenderer in sync with the tree renderer's state:
//   • point data (built from renderer.nodes + the date annotation)
//   • visual style (tip size/colour/halo, selection colours, bg colour…)
//   • bidirectional selection and hover sync
//
// Called from peartree.js immediately after the TreeRenderer is created.
// ─────────────────────────────────────────────────────────────────────────────

import { RTTRenderer }      from './rttrenderer.js';
import { TreeCalibration }  from './phylograph.js';
import { downloadBlob }     from './utils.js';

/**
 * Create the Root-to-Tip panel controller.
 *
 * @param {Object}   opts
 * @param {HTMLElement} opts.panel          – #rtt-panel
 * @param {HTMLCanvasElement} opts.canvas   – #rtt-canvas  (inside the panel)
 * @param {Function} opts.getRenderer       – () => TreeRenderer instance
 * @param {Function} opts.getCalibration    – () => TreeCalibration instance
 * @param {Function} opts.getDateAnnotKey   – () => string (e.g. "date") or ''
 * @param {Function} opts.getDateFormat     – () => string (e.g. 'yyyy-MM-dd')
 * @param {Function} [opts.getIsTimedTree]  – () => boolean
 * @param {Function} [opts.getShowRootAge]  – () => boolean
 * @param {Function} [opts.getGridLines]    – () => 'both'|'horizontal'|'vertical'|'off'
 * @param {Function} [opts.getAspectRatio]  – () => 'fit'|'1:1'|'4:3'|'3:2'|'16:9'
 * @param {Function} [opts.onCalibrationChange] – () called after calibration is recomputed
 * @param {Function} [opts.onClose]         – () called when closed
 * @param {Function} [opts.onPinChange]     – (pinned:boolean) called on pin toggle
 * @param {Function} [opts.onStatsBoxCornerChange] – (corner:string) called when stats box is dragged to new corner
 */
export function createRTTChart({
  panel,
  canvas,
  getRenderer,
  getCalibration,
  getDateAnnotKey,
  getDateFormat,
  getAxisColor,
  getAxisFontSize,
  getAxisLineWidth,
  getTickOptions,
  getIsTimedTree,
  getShowRootAge,
  getGridLines,
  getAspectRatio,
  onCalibrationChange,
  onClose,
  onPinChange,
  onStatsBoxCornerChange,
}) {
  const rtt = new RTTRenderer(canvas);

  let _open   = false;
  let _pinned = false;

  // ── Header buttons ─────────────────────────────────────────────────────────
  const btnPin      = panel.querySelector('#rtt-btn-pin');
  const btnClose    = panel.querySelector('#rtt-btn-close');
  const btnStats    = panel.querySelector('#rtt-btn-stats');
  const btnDownload = panel.querySelector('#rtt-btn-download');

  btnDownload?.addEventListener('click', () => _downloadCSV());

  btnStats?.addEventListener('click', () => {
    rtt.statsBoxVisible = !rtt.statsBoxVisible;
    rtt._lastStatsRect      = null;
    rtt._lastStatsCloseRect = null;
    rtt._dirty = true;
    btnStats.classList.toggle('active', rtt.statsBoxVisible);
  });
  rtt.onStatsBoxVisibleChange = (visible) => {
    btnStats?.classList.toggle('active', visible);
  };
  rtt.onStatsBoxCornerChange = (corner) => {
    if (onStatsBoxCornerChange) onStatsBoxCornerChange(corner);
  };

  btnPin.addEventListener('click', () => {
    _pinned = !_pinned;
    panel.classList.toggle('pinned', _pinned);
    btnPin.classList.toggle('active', _pinned);
    if (onPinChange) onPinChange(_pinned);
    rtt._resize();
  });

  btnClose.addEventListener('click', () => {
    close();
    if (onClose) onClose();
  });

  // ── CSV download ──────────────────────────────────────────────────────────

  function _downloadCSV() {
    const pts = _buildPoints();
    const cal = getCalibration();
    const fmt = getDateFormat();
    const reg = cal?.regression;

    const header = ['name', 'date', 'date (decimal year)', 'divergence', 'regression', 'residual'];
    const rows = [header];

    for (const pt of pts) {
      const dateVal   = pt.x != null ? String(pt.x) : '';
      const dateStr   = pt.x != null
        ? (cal?.decYearToString(pt.x, 'full', fmt) ?? String(pt.x))
        : '';
      const divStr    = String(pt.y);
      let   regStr    = '';
      let   residStr  = '';
      if (reg && pt.x != null) {
        const predicted = reg.a * pt.x + reg.b;
        regStr   = String(predicted);
        residStr = String(pt.y - predicted);
      }
      rows.push([pt.name, dateStr, dateVal, divStr, regStr, residStr]);
    }

    const csvContent = rows.map(row =>
      row.map(cell => {
        const s = cell ?? '';
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? '"' + s.replace(/"/g, '""') + '"'
          : s;
      }).join(',')
    ).join('\n');

    downloadBlob(csvContent, 'text/csv', 'root-to-tip.csv');
  }

  // ── Resize-handle drag ─────────────────────────────────────────────────────
  const handle = panel.querySelector('#rtt-resize-handle');
  let _drg = false, _drgX0 = 0, _drgW0 = 0, _rafId = null;

  if (handle) {
    handle.addEventListener('mousedown', e => {
      _drg  = true;
      _drgX0 = e.clientX;
      _drgW0 = panel.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      e.preventDefault();
    });
  }

  window.addEventListener('mousemove', e => {
    if (!_drg) return;
    const delta = _drgX0 - e.clientX;   // drag left → panel grows
    const newW  = Math.max(200, Math.min(900, _drgW0 + delta));
    panel.style.width = `${newW}px`;
    document.documentElement.style.setProperty('--rtt-panel-w', `${newW}px`);
    if (_rafId === null) {
      _rafId = requestAnimationFrame(() => {
        _rafId = null;
        rtt._resize();
        getRenderer()?._resize?.();
      });
    }
  });

  window.addEventListener('mouseup', () => {
    if (_drg) { _drg = false; document.body.style.cursor = ''; }
  });

  // ── Bidirectional selection sync ───────────────────────────────────────────

  /** RTT selection → tree renderer */
  rtt.onSelectionChange = ids => {
    const tr = getRenderer();
    if (!tr) return;
    tr._selectedTipIds = new Set(ids);
    tr._updateMRCA?.();
    tr._notifyStats?.();
    if (tr._onNodeSelectChange) tr._onNodeSelectChange(ids.size > 0);
    tr._dirty = true;
  };

  /** RTT hover → tree renderer */
  rtt.onHoverChange = id => {
    const tr = getRenderer();
    if (!tr) return;
    tr._hoveredNodeId = id;
    tr._dirty = true;
  };

  // ── Data builders ──────────────────────────────────────────────────────────

  function _buildPoints() {
    const tr  = getRenderer();
    const cal = getCalibration();
    const key = getDateAnnotKey();
    if (!tr || !tr.nodes) return [];

    const pts = [];
    for (const node of tr.nodes) {
      if (!node.isTip) continue;
      if (node.isCollapsed) continue;   // collapsed clades show as triangles, not points

      // X axis: assigned date from the chosen date annotation.
      // Works whether or not the Axis calibration is active — parseDateToDecYear
      // handles ISO strings and decimal-year reals directly.
      let x = null;
      if (key) {
        const raw = tr._statValue(node, key);
        if (raw != null) {
          x = TreeCalibration.parseDateToDecYear(String(raw));
        }
      }

      // Colour: resolve exactly as the tree renderer does.
      // Use _statValue so def.dataKey remapping and built-in synthetic keys are
      // handled correctly, matching the tree's own colour logic.
      const colourKey = tr._tipColourBy;
      let colour = null;
      if (colourKey) {
        const val = tr._statValue(node, colourKey);
        if (colourKey === 'user_colour') {
          // The annotation value IS a CSS colour — skip the identity-scale lookup
          // to avoid misses when a freshly-painted colour isn't yet in def.values.
          colour = val ?? null;
        } else {
          colour = tr._tipColourForValue(val) ?? null;
        }
      }

      pts.push({ id: node.id, x, y: node.x, name: node.name ?? node.id, colour });
    }
    return pts;
  }

  function _syncStyle() {
    const tr = getRenderer();
    if (!tr) return;
    Object.assign(rtt, {
      // Tip shape
      tipRadius:             tr.tipRadius,
      tipShapeColor:         tr.tipShapeColor,
      tipHaloSize:           tr.tipHaloSize,
      tipShapeBgColor:       tr.tipShapeBgColor,
      // Canvas background & text
      bgColor:               tr.bgColor,
      fontSize:              tr.fontSize,
      // Selection indicators
      selectedTipStrokeColor:   tr.selectedTipStrokeColor,
      selectedTipFillColor:     tr.selectedTipFillColor,
      selectedTipGrowthFactor:  tr.selectedTipGrowthFactor,
      selectedTipMinSize:       tr.selectedTipMinSize,
      selectedTipStrokeWidth:   tr.selectedTipStrokeWidth,
      selectedTipStrokeOpacity: tr.selectedTipStrokeOpacity,
      selectedTipFillOpacity:   tr.selectedTipFillOpacity,
      // Hover indicators
      tipHoverStrokeColor:      tr.tipHoverStrokeColor,
      tipHoverFillColor:        tr.tipHoverFillColor,
      tipHoverGrowthFactor:     tr.tipHoverGrowthFactor,
      tipHoverMinSize:          tr.tipHoverMinSize,
      tipHoverStrokeWidth:      tr.tipHoverStrokeWidth,
      tipHoverStrokeOpacity:    tr.tipHoverStrokeOpacity,
      tipHoverFillOpacity:      tr.tipHoverFillOpacity,
      // Axis style (from the Axis section in the palette panel)
      axisColor:    getAxisColor?.()    ?? rtt.axisColor,
      axisFontSize: getAxisFontSize?.() ?? rtt.axisFontSize,
      axisLineWidth: getAxisLineWidth?.() ?? rtt.axisLineWidth,
    });
    rtt.showRootAge   = getShowRootAge?.()  ?? false;
    rtt.gridLines     = getGridLines?.()    ?? 'both';
    rtt.aspectRatio   = getAspectRatio?.()  ?? 'fit';
  }

  function _recomputeCalibration() {
    const tr  = getRenderer();
    const cal = getCalibration();
    const key = getDateAnnotKey();
    if (!tr || !tr.nodes || !cal) return;
    const pts = _buildPoints();
    let minTipH = Infinity;
    for (const node of tr.nodes) {
      if (node.isTip && !node.isCollapsed) {
        const h = tr.maxX - node.x;
        if (h < minTipH) minTipH = h;
      }
    }
    if (!isFinite(minTipH)) minTipH = 0;
    const reg = TreeCalibration.computeOLS(pts);
    if (getIsTimedTree?.()) {
      cal.setAnchor(key, tr.nodeMap, tr.maxX);
      cal.setRegression(reg);
    } else {
      cal.applyRegression(reg, tr.maxX, minTipH);
    }
    onCalibrationChange?.();
  }

  function _pushToRenderer() {
    if (!_open) return;
    const tr  = getRenderer();
    const cal = getCalibration();
    if (!tr) return;
    _syncStyle();
    if (getTickOptions) rtt.tickOptions = getTickOptions();
    rtt.setCalibration(cal?.isActive ? cal : null, getDateFormat());
    rtt.setPoints(_buildPoints());
    rtt._selectedTipIds = new Set(tr._selectedTipIds);
    rtt._hoveredTipId   = tr._hoveredNodeId;
    rtt._dirty = true;
  }

  function _update() {
    _recomputeCalibration();
    _pushToRenderer();
  }

  // ── Open / Close ───────────────────────────────────────────────────────────

  function open() {
    _open = true;
    panel.classList.add('open');
    if (_pinned) {
      panel.classList.add('pinned');
      btnPin.classList.add('active');
      if (onPinChange) onPinChange(true);
    }
    // Resize + populate on the next frame (panel may not have laid out yet)
    requestAnimationFrame(() => {
      rtt._resize();
      _update();
    });
  }

  function close() {
    _open = false;
    panel.classList.remove('open');
    // Preserve _pinned so reopening the panel restores the pinned layout.
    if (_pinned) {
      panel.classList.remove('pinned');
      btnPin.classList.remove('active');
      if (onPinChange) onPinChange(false);
    }
  }

  // ── Public interface ───────────────────────────────────────────────────────
  return {
    open,
    close,
    isOpen:   () => _open,
    isPinned: () => _pinned,

    /** Programmatically set the pin state (e.g. to restore from saved settings). */
    setPin(pinned) {
      _pinned = !!pinned;
      btnPin.classList.toggle('active', _pinned);
      // Only update the DOM layout if the panel is currently open.
      if (_open) {
        panel.classList.toggle('pinned', _pinned);
        if (onPinChange) onPinChange(_pinned);
        rtt._resize();
      }
    },

    /**
     * Close the panel on tree load — hides it visually but preserves the pin
     * preference so re-opening restores the pinned layout.
     */
    closeForLoad() {
      if (!_open) return;
      _open = false;
      panel.classList.remove('open');
      // Remove pinned layout from the DOM without clearing the _pinned flag,
      // so the next open() call will restore the pinned state.
      if (_pinned) {
        panel.classList.remove('pinned');
        if (onPinChange) onPinChange(false);
      }
    },

    /** Get/set the stats box corner ('tl'|'tr'|'bl'|'br'). */
    getStatsBoxCorner: () => rtt.statsBoxCorner,
    setStatsBoxCorner(corner) {
      if (corner) { rtt.statsBoxCorner = corner; rtt._dirty = true; }
    },

    /** Resize the canvas (call during window resize or panel-pin transitions). */
    resize() { rtt._resize(); },

    /** Call when the visible tip set or tree layout changes. */
    notifyLayoutChange() { _update(); },

    /** Call when the tree renderer's style changes (theme, colours, etc.). */
    notifyStyleChange() {
      if (!_open) return;
      _syncStyle();
      const cal = getCalibration();
      rtt.setCalibration(cal?.isActive ? cal : null, getDateFormat());
      // Re-build points so colours (from colour-by scale) update too.
      rtt.setPoints(_buildPoints());
      rtt._dirty = true;
    },

    /** Call when the tree's selection changes externally (e.g. canvas click). */
    notifySelectionChange() {
      if (!_open) return;
      const tr = getRenderer();
      if (tr) rtt.setSelectedIds(tr._selectedTipIds);
    },

    /** Call when the tree's hover changes externally (tree canvas mousemove). */
    notifyHoverChange(id) {
      if (_open) rtt.setHoveredId(id);
    },

    /** Call when calibration or the date annotation key changes. */
    notifyCalibrationChange() { _update(); },

    /** Recompute OLS calibration and fire onCalibrationChange; also updates renderer if open. */
    recomputeCalibration() { _update(); },
  };
}
