/* ════════════════════════���══════════════════════
   Bobcorn Wiki — Sidebar, Language, Reveal
   ═══════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ─── Detect current lang from URL path ─── */
    var path = location.pathname;
    var langMatch = path.match(/\/wiki\/([a-z]{2}(?:-[A-Z]{2})?)\//);
    var currentLang = langMatch ? langMatch[1] : 'en';
    var currentPage = path.split('/').pop() || 'index.html';

    /* ─── Load nav.json and build sidebar ─── */
    var navData = null;

    function str(key) {
        if (!navData) return key;
        var s = navData.strings[currentLang] || navData.strings['en'];
        return s[key] || key;
    }

    function buildSidebar() {
        var sidebar = document.querySelector('.wiki-sidebar');
        if (!sidebar || !navData) return;

        var html = '';
        navData.sections.forEach(function (section) {
            html += '<div class="sidebar-section">';
            html += '<div class="sidebar-label">' + str(section.labelKey) + '</div>';
            html += '<ul class="sidebar-nav">';
            section.items.forEach(function (item) {
                var isActive = currentPage === item.page;
                var cls = isActive ? ' class="active"' : '';
                html += '<li><a href="' + item.page + '"' + cls + '>' + str(item.titleKey) + '</a></li>';
            });
            html += '</ul></div>';
        });

        sidebar.innerHTML = html;
    }

    /* ─── Language switcher ─── */
    function buildLangDropdown() {
        var dropdown = document.querySelector('.lang-dropdown');
        if (!dropdown || !navData) return;

        var html = '';
        navData.languages.forEach(function (lang) {
            var href = '../' + lang.code + '/' + currentPage;
            var cls = lang.code === currentLang ? ' class="active"' : '';
            html += '<a href="' + href + '"' + cls + '>' + lang.label + '</a>';
        });
        dropdown.innerHTML = html;
    }

    function initLangToggle() {
        var btn = document.querySelector('.lang-btn');
        var dropdown = document.querySelector('.lang-dropdown');
        if (!btn || !dropdown) return;

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', function () {
            dropdown.classList.remove('open');
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') dropdown.classList.remove('open');
        });
    }

    /* ─── Mobile sidebar toggle ─── */
    function initSidebarToggle() {
        var toggle = document.querySelector('.sidebar-toggle');
        var sidebar = document.querySelector('.wiki-sidebar');
        var overlay = document.querySelector('.sidebar-overlay');
        if (!toggle || !sidebar) return;

        function closeSidebar() {
            sidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('open');
        }

        toggle.addEventListener('click', function () {
            var isOpen = sidebar.classList.toggle('open');
            if (overlay) overlay.classList.toggle('open', isOpen);
        });

        if (overlay) {
            overlay.addEventListener('click', closeSidebar);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeSidebar();
        });
    }

    /* ─── Reveal animations ─── */
    function initReveal() {
        var els = document.querySelectorAll('.reveal');
        if (!els.length) return;

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            els.forEach(function (el) { el.classList.add('visible'); });
            return;
        }

        /* Stagger hero elements */
        els.forEach(function (el, i) {
            el.style.transitionDelay = (i * 0.06 + 0.1) + 's';
        });

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                els.forEach(function (el) { el.classList.add('visible'); });
            });
        });
    }

    /* ─── Update topbar wiki label ─── */
    function updateTopbarLabel() {
        var label = document.querySelector('.topbar-title');
        if (label) label.textContent = str('wiki');
    }

    /* ─── RTL support ─── */
    function applyRTL() {
        if (!navData) return;
        var langInfo = navData.languages.find(function (l) { return l.code === currentLang; });
        if (langInfo && langInfo.dir === 'rtl') {
            document.documentElement.setAttribute('dir', 'rtl');
        }
    }

    /* ─── Init ─── */
    var scriptEl = document.querySelector('script[src*="wiki.js"]');
    var basePath = scriptEl ? scriptEl.src.replace(/wiki\.js.*$/, '') : '../shared/';

    fetch(basePath + 'nav.json')
        .then(function (r) { return r.json(); })
        .then(function (data) {
            navData = data;
            applyRTL();
            buildSidebar();
            buildLangDropdown();
            updateTopbarLabel();
            initLangToggle();
            initSidebarToggle();
            initReveal();
        })
        .catch(function () {
            /* Fallback: still init interactions */
            initLangToggle();
            initSidebarToggle();
            initReveal();
        });
})();
