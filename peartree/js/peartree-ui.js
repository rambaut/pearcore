// ── Tool palette panel ────────────────────────────────────────────────────
const palettePanel     = document.getElementById('palette-panel');
const btnPalette       = document.getElementById('btn-palette');
const btnPaletteClose  = document.getElementById('btn-palette-close');
const btnPalettePin    = document.getElementById('btn-palette-pin');
const PALETTE_PIN_KEY  = 'peartree-palette-pinned';
let   palettePinned    = false;

function _afterPanelTransition() {
  // Pump resize events every frame for the duration of the CSS transition so the
  // tree canvas rescales continuously in sync with the margin animation.
  const DURATION = 250; // ms — slightly longer than the 0.22s CSS transition
  const start = performance.now();
  function pump(now) {
    window.dispatchEvent(new Event('resize'));
    if (now - start < DURATION) requestAnimationFrame(pump);
  }
  requestAnimationFrame(pump);
}

function openPalette(advanced = false) {
  palettePanel.classList.add('open');
  palettePanel.classList.toggle('advanced', advanced);
  if (palettePinned) {
    palettePanel.classList.add('pinned');
    document.body.classList.add('palette-pinned');
  }
  btnPalette.classList.add('active');
  _afterPanelTransition();
}
function closePalette() {
  // Remove open/pinned CSS classes and canvas margin, but preserve the
  // palettePinned flag so reopening the panel restores pinned behaviour.
  palettePanel.classList.remove('open', 'advanced', 'pinned');
  document.body.classList.remove('palette-pinned');
  btnPalette.classList.remove('active');
  _afterPanelTransition();
}
function pinPalette() {
  palettePinned = true;
  localStorage.setItem(PALETTE_PIN_KEY, '1');
  palettePanel.classList.add('open', 'pinned');
  document.body.classList.add('palette-pinned');
  btnPalettePin.classList.add('active');
  btnPalettePin.title = 'Unpin panel';
  btnPalettePin.innerHTML = '<i class="bi bi-pin-angle-fill"></i>';
  btnPalette.classList.add('active');
  _afterPanelTransition();
}
function unpinPalette() {
  palettePinned = false;
  localStorage.removeItem(PALETTE_PIN_KEY);
  palettePanel.classList.remove('pinned');
  document.body.classList.remove('palette-pinned');
  btnPalettePin.classList.remove('active');
  btnPalettePin.title = 'Pin panel open';
  btnPalettePin.innerHTML = '<i class="bi bi-pin-angle"></i>';
  _afterPanelTransition();
}

btnPalette.addEventListener('click', e => {
  e.stopPropagation();
  if (palettePanel.classList.contains('open')) {
    closePalette();
  } else {
    openPalette(e.altKey);
  }
});
btnPaletteClose.addEventListener('click', closePalette);
btnPalettePin.addEventListener('click', () => {
  if (palettePinned) unpinPalette();
  else               pinPalette();
});

// Restore pinned state from previous session.
if (localStorage.getItem(PALETTE_PIN_KEY) === '1') pinPalette();

// Slider live value readouts
const fontSliderEl = document.getElementById('font-size-slider');
const tipSliderEl  = document.getElementById('tip-size-slider');
const nodeSliderEl = document.getElementById('node-size-slider');
const fontValEl    = document.getElementById('font-size-value');
const tipValEl     = document.getElementById('tip-size-value');
const nodeValEl    = document.getElementById('node-size-value');
fontSliderEl.addEventListener('input',  () => { fontValEl.textContent  = fontSliderEl.value; });
tipSliderEl.addEventListener('input',   () => { tipValEl.textContent   = tipSliderEl.value; });
nodeSliderEl.addEventListener('input',  () => { nodeValEl.textContent  = nodeSliderEl.value; });

// Help panel
const helpPanel   = document.getElementById('help-panel');
const helpContent = document.getElementById('help-content');
const btnHelp      = document.getElementById('btn-help');
const btnHelpClose = document.getElementById('btn-help-close');
let helpLoaded = false;

async function openHelp() {
  if (!helpLoaded) {
    try {
      const md = await window.peartree.fetchWithFallback('help.md');
      helpContent.innerHTML = marked.parse(md);
      helpLoaded = true;
    } catch (err) {
      helpContent.innerHTML = `<p style="color:var(--pt-red)">Could not load help.md: ${err.message}</p>`;
    }
  }
  closeAbout();
  helpPanel.classList.add('open');
  btnHelp.classList.add('active');
}

function closeHelp() {
  helpPanel.classList.remove('open');
  btnHelp.classList.remove('active');
}

btnHelp.addEventListener('click', e => {
  e.stopPropagation();
  helpPanel.classList.contains('open') ? closeHelp() : openHelp();
});
btnHelpClose.addEventListener('click', closeHelp);

// About modal
const aboutPanel    = document.getElementById('about-panel');
const aboutBackdrop = document.getElementById('about-backdrop');
const aboutContent  = document.getElementById('about-content');
const btnAbout      = document.getElementById('btn-about');
const btnAboutClose = document.getElementById('btn-about-close');
let aboutLoaded = false;

/* ── Light / dark mode toggle ── */
(function () {
  const STORAGE_KEY = 'pt-theme';
  const btnTheme = document.getElementById('btn-theme');
  const icon = btnTheme.querySelector('i');

  // When the calling page sets storageKey:null, all localStorage is disabled for the embed.
  const noStorage = Object.prototype.hasOwnProperty.call(window.peartreeConfig ?? {}, 'storageKey')
                    && window.peartreeConfig.storageKey === null;

  // In embed mode scope the theme attribute to the .pt-embed-wrap element so we don't
  // affect the surrounding report page.  In standalone mode use <html> as normal.
  const themeRoot = noStorage
    ? (btnTheme.closest('.pt-embed-wrap') ?? document.documentElement)
    : document.documentElement;

  function applyTheme(mode) {
    if (mode === 'light') {
      themeRoot.setAttribute('data-bs-theme', 'light');
      icon.className = 'bi bi-moon-stars';
      btnTheme.title = 'Switch to dark mode';
    } else {
      themeRoot.setAttribute('data-bs-theme', 'dark');
      icon.className = 'bi bi-sun';
      btnTheme.title = 'Switch to light mode';
    }
  }

  // Priority: ?mode=dark/light URL param > peartreeConfig.ui.theme > localStorage (if enabled) > system preference
  const urlMode = new URLSearchParams(window.location.search).get('mode');
  const cfgTheme = window.peartreeConfig?.ui?.theme;
  const saved = (urlMode === 'dark' || urlMode === 'light') ? urlMode
              : (cfgTheme === 'dark' || cfgTheme === 'light') ? cfgTheme
              : (!noStorage ? localStorage.getItem(STORAGE_KEY) : null);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));

  btnTheme.addEventListener('click', () => {
    const next = themeRoot.getAttribute('data-bs-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    if (!noStorage) localStorage.setItem(STORAGE_KEY, next);
  });
})();

async function openAbout() {
  if (!aboutLoaded) {
    try {
      const md = await window.peartree.fetchWithFallback('about.md');
      aboutContent.innerHTML = marked.parse(md);
      aboutLoaded = true;
    } catch (err) {
      aboutContent.innerHTML = `<p style="color:var(--pt-red)">Could not load about.md: ${err.message}</p>`;
    }
  }
  closeHelp();
  aboutPanel.classList.add('open');
  aboutBackdrop.classList.add('open');
  btnAbout.classList.add('active');
}

function closeAbout() {
  aboutPanel.classList.remove('open');
  aboutBackdrop.classList.remove('open');
  btnAbout.classList.remove('active');
}

btnAbout.addEventListener('click', e => {
  e.stopPropagation();
  aboutPanel.classList.contains('open') ? closeAbout() : openAbout();
});
btnAboutClose.addEventListener('click', closeAbout);
aboutBackdrop.addEventListener('click', closeAbout);

// Clicking the tree canvas closes any open panel immediately (unless pinned).
document.getElementById('tree-canvas').addEventListener('pointerdown', () => {
  if (!palettePinned) closePalette();
  closeHelp();
  closeAbout();
});

// Tab / ⌥Tab toggles palette; Alt held opens in advanced mode
document.addEventListener('keydown', e => {
  if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    if (palettePinned) return;   // Tab does nothing when pinned
    palettePanel.classList.contains('open') ? closePalette() : openPalette(e.altKey);
  }
});

// Close help on Escape; also close palette if NOT pinned
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeHelp(); if (!palettePinned) closePalette(); closeAbout(); }
});

// ── Keep panels below toolbar ──────────────────────────────────────────
const _toolbar = document.querySelector('.pt-toolbar');
function _updateToolbarH() {
  document.documentElement.style.setProperty('--pt-toolbar-h', _toolbar.offsetHeight + 'px');
}
_updateToolbarH();
new ResizeObserver(_updateToolbarH).observe(_toolbar);
