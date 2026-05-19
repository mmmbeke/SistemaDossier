/**
 * Dossier Dashboard - Main script
 * Funcionalidades:
 *   - Navegación entre tabs principales y de settings
 *   - Toggles, filtros y selector de tema
 *   - Sistema de internacionalización (i18n) ES/EN
 *   - Persistencia de preferencias en localStorage
 */

/* ============================================
   TAB NAVIGATION
   ============================================ */
function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach((tab) => {
    tab.classList.toggle('active', tab.id === tabId);
  });
}

function switchSettingsTab(settingsId) {
  document.querySelectorAll('.settings-nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.settings === settingsId);
  });
  document.querySelectorAll('.settings-section').forEach((section) => {
    section.classList.toggle('active', section.id === 'settings-' + settingsId);
  });
}

/* ============================================
   THEME SELECTOR
   ============================================ */
const THEME_STORAGE_KEY = 'dossier-theme';
const systemThemeMedia = window.matchMedia('(prefers-color-scheme: light)');

function resolveTheme(choice) {
  if (choice === 'system') {
    return systemThemeMedia.matches ? 'light' : 'dark';
  }
  return choice === 'light' ? 'light' : 'dark';
}

function applyTheme(choice) {
  const resolved = resolveTheme(choice);
  document.documentElement.setAttribute('data-theme', resolved);
  localStorage.setItem(THEME_STORAGE_KEY, choice);

  document.querySelectorAll('.theme-option').forEach((opt) => {
    opt.classList.toggle('active', opt.dataset.theme === choice);
  });
}

systemThemeMedia.addEventListener('change', () => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  if (stored === 'system') applyTheme('system');
});

/* ============================================
   INTERNATIONALIZATION (i18n)
   ============================================ */
const LANG_STORAGE_KEY = 'dossier-lang';
const SUPPORTED_LANGS = ['en', 'en-gb', 'es', 'pt', 'it', 'fr', 'de'];
const DEFAULT_LANG = 'en';

function getInitialLang() {
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored && SUPPORTED_LANGS.includes(stored)) return stored;

  const browserLang = (navigator.language || 'en').toLowerCase();
  if (SUPPORTED_LANGS.includes(browserLang)) return browserLang;

  const shortLang = browserLang.slice(0, 2);
  return SUPPORTED_LANGS.includes(shortLang) ? shortLang : DEFAULT_LANG;
}

function translate(key, lang) {
  const dict = translations[lang] || translations[DEFAULT_LANG];
  return dict[key] !== undefined ? dict[key] : key;
}

function applyLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.documentElement.setAttribute('lang', lang);

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = translate(el.dataset.i18n, lang);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = translate(el.dataset.i18nPlaceholder, lang);
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = translate(el.dataset.i18nTitle, lang);
  });

  const langSelect = document.getElementById('display-language');
  if (langSelect && langSelect.value !== lang) {
    langSelect.value = lang;
  }
}

/* ============================================
   EVENT LISTENERS
   ============================================ */
function setupEventListeners() {
  // Main nav tabs
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // Settings nav tabs
  document.querySelectorAll('.settings-nav-item').forEach((item) => {
    item.addEventListener('click', () => switchSettingsTab(item.dataset.settings));
  });

  // Filter tabs (dossiers)
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Theme selector
  document.querySelectorAll('.theme-option').forEach((btn) => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // Generic toggles (calendar auto-generate, notifications, etc.)
  document.querySelectorAll('[data-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', () => toggle.classList.toggle('on'));
  });

  // Quick action shortcuts (Overview cards)
  document.querySelectorAll('[data-shortcut]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [tab, section] = btn.dataset.shortcut.split(':');
      switchTab(tab);
      if (section) switchSettingsTab(section);
    });
  });

  // Search suggestions show/hide
  const searchInput = document.getElementById('dossier-search');
  const suggestions = document.getElementById('suggestions');
  if (searchInput && suggestions) {
    searchInput.addEventListener('focus', () => suggestions.classList.add('visible'));
    searchInput.addEventListener('blur', () => {
      setTimeout(() => suggestions.classList.remove('visible'), 200);
    });

    suggestions.querySelectorAll('.suggestion-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        searchInput.value = item.textContent.trim();
        suggestions.classList.remove('visible');
      });
    });
  }

  // Display Language selector → cambia el idioma de toda la página
  const langSelect = document.getElementById('display-language');
  if (langSelect) {
    langSelect.addEventListener('change', (e) => applyLang(e.target.value));
  }
}

/* ============================================
   INIT
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Aplicar tema guardado (default: dark)
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  applyTheme(storedTheme);

  // Aplicar idioma guardado / detectado
  applyLang(getInitialLang());

  setupEventListeners();
});
