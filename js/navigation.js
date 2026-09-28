/* A persistent shell keeps the music iframe connected across blog navigation. */
(function () {
  'use strict';
  if (window.AyerNavigation) return;
  var main = document.querySelector('main[data-ayer-page]');
  if (!main) return;

  var currentURL = new URL(location.href);
  var requestId = 0;
  var controller;
  var pendingScroll;
  var modalOpener;
  var searchInitialized = false;
  var loadedScripts = new Map();
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var searchPath = document.querySelector('script[data-search-path]').dataset.searchPath;
  document.querySelectorAll('script[src]').forEach(function (script) {
    loadedScripts.set(script.src, Promise.resolve());
  });

  function notify(name, initial) {
    document.dispatchEvent(new CustomEvent(name, {
      detail: { url: location.href, root: main, initial: Boolean(initial) }
    }));
  }

  function setBusy(busy) {
    document.body.classList.toggle('is-navigating', busy);
    main.setAttribute('aria-busy', String(busy));
  }

  function saveScroll() {
    if (document.body.classList.contains('is-navigating')) return;
    history.replaceState(Object.assign({}, history.state, {
      ayer: true, scrollTop: main.scrollTop, scrollLeft: main.scrollLeft
    }), '', location.href);
  }

  function hashTarget(hash) {
    try {
      var id = decodeURIComponent(hash.slice(1));
      return id && (document.getElementById(id) || document.getElementsByName(id)[0]);
    } catch (_) {
      return null;
    }
  }

  function restoreScroll(url, state, smooth) {
    var target = url.hash && hashTarget(url.hash);
    var top = state && typeof state.scrollTop === 'number' ? state.scrollTop : 0;
    if (!state && target && main.contains(target)) {
      top = main.scrollTop + target.getBoundingClientRect().top - main.getBoundingClientRect().top - 24;
    }
    main.scrollTo({
      top: top,
      left: state && state.scrollLeft || 0,
      behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant'
    });
  }

  function closeOverlays(restoreFocus) {
    document.querySelector('.search-form-wrap').classList.remove('on');
    ['#mask', '#reward', '#share-mask'].forEach(function (selector) {
      var element = document.querySelector(selector);
      if (element) {
        element.style.display = 'none';
        if (selector === '#reward') element.setAttribute('aria-hidden', 'true');
      }
    });
    document.querySelectorAll('.wx-share-modal').forEach(function (element) {
      element.classList.remove('in', 'ready');
      element.setAttribute('aria-hidden', 'true');
    });
    if (window.jQuery && jQuery.modal && jQuery.modal.close) jQuery.modal.close();
    if (restoreFocus !== false && modalOpener && modalOpener.isConnected) modalOpener.focus({ preventScroll: true });
    modalOpener = null;
  }

  function syncSidebar() {
    var sidebar = document.querySelector('.sidebar');
    var toggle = document.querySelector('.navbar-toggle');
    if (toggle && sidebar) toggle.setAttribute('aria-expanded', String(sidebar.classList.contains('on')));
    document.querySelectorAll('.nav-main a[href]').forEach(function (link) {
      var url = new URL(link.href);
      var path = url.pathname.replace(/\/$/, '') || '/';
      var current = location.pathname.replace(/\/$/, '') || '/';
      var active = url.origin === location.origin && (path === '/' ? current === '/' : current === path || current.indexOf(path + '/') === 0);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      link.classList.toggle('is-active', active);
    });
  }

  function updateTopButton() {
    var top = document.getElementById('totop');
    if (top) {
      top.style.opacity = main.scrollTop > 360 ? '1' : '0';
      top.style.visibility = main.scrollTop > 360 ? 'visible' : 'hidden';
      top.style.pointerEvents = main.scrollTop > 360 ? 'auto' : 'none';
    }
  }

  function initPage(initial) {
    // Fixed dialogs must live outside refracting article surfaces: a backdrop
    // filter establishes a containing block for its fixed descendants.
    main.querySelectorAll('.wx-share-modal, #share-mask').forEach(function (element) {
      element.setAttribute('data-ayer-page-portal', '');
      if (element.matches('.wx-share-modal')) {
        element.classList.add('liquid-glass');
        element.setAttribute('aria-hidden', 'true');
      }
      document.getElementById('app').appendChild(element);
    });
    syncSidebar();
    updateTopButton();
    if (window.tocbot) {
      tocbot.destroy();
      if (main.querySelector('.tocbot')) tocbot.init({
        tocSelector: '.tocbot', contentSelector: '.article-entry',
        headingSelector: 'h1, h2, h3, h4, h5, h6', hasInnerContainers: true,
        // Navigation owns hash scrolling and history; do not install Tocbot's
        // additional document click listener every time the article changes.
        scrollSmooth: false, scrollContainer: 'main',
        positionFixedSelector: '.tocbot', positionFixedClass: 'is-position-fixed',
        fixedSidebarOffset: 'auto'
      });
    }
    if (window.jQuery) {
      if (jQuery.fn.justifiedGallery) jQuery(main).find('#gallery').justifiedGallery({ rowHeight: 200, margins: 5 });
      if (!searchInitialized && window.searchFunc && document.querySelector('.local-search-input')) {
        searchFunc(searchPath, 'local-search-input', 'local-search-result');
        searchInitialized = true;
      }
    }
    main.querySelectorAll('img.lazy').forEach(function (image) {
      image.loading = 'lazy';
      if (image.dataset.original) image.src = image.dataset.original;
      if (image.dataset.originalSrcset) image.srcset = image.dataset.originalSrcset;
    });
    if (window.viewer_init && window.PhotoSwipe) window.viewer_init();
    if (window.ayerInitClipboard) window.ayerInitClipboard();
    if (window.MathJax && MathJax.Hub) MathJax.Hub.Queue(['Typeset', MathJax.Hub, main]);
    if (window.renderMathInElement) window.renderMathInElement(main);
    if (!initial && window.bszCaller && window.bszTag) {
      var pageURL = location.href;
      bszCaller.fetch('https://busuanzi.ibruce.info/busuanzi?jsonpCallback=BusuanziCallback', function (values) {
        if (location.href !== pageURL) return;
        bszTag.texts(values);
        bszTag.shows();
      });
    }
    notify('ayer:page-ready', initial);
  }

  function loadScript(source, baseURL) {
    var url = new URL(source.getAttribute('src'), baseURL).href;
    if (loadedScripts.has(url)) return loadedScripts.get(url);
    var promise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timeout = setTimeout(function () {
        script.remove();
        reject(new Error('Page script timed out: ' + url));
      }, 10000);
      Array.from(source.attributes).forEach(function (attribute) {
        if (attribute.name !== 'src') script.setAttribute(attribute.name, attribute.value);
      });
      script.async = false;
      script.src = url;
      script.onload = function () { clearTimeout(timeout); resolve(); };
      script.onerror = function () { clearTimeout(timeout); script.remove(); reject(new Error('Page script unavailable: ' + url)); };
      document.head.appendChild(script);
    });
    loadedScripts.set(url, promise);
    promise.catch(function () { loadedScripts.delete(url); });
    return promise;
  }

  async function runPageScripts(scripts, url, ticket) {
    for (var i = 0; i < scripts.length; i++) {
      if (ticket !== requestId) return;
      var source = scripts[i];
      if (source.hasAttribute('data-pjax-skip')) continue;
      var type = source.getAttribute('type');
      if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type)) continue;
      try {
        if (source.src) await loadScript(source, url);
        else {
          // Isolate page-local declarations so repeated visits cannot redeclare const/let.
          // Script elements also preserve normal browser CSP handling.
          var script = document.createElement('script');
          if (type === 'module') script.type = type;
          if (source.nonce) script.nonce = source.nonce;
          script.textContent = type === 'module' ? source.textContent : '(function(){\n' + source.textContent + '\n}).call(window);';
          document.body.appendChild(script);
          script.remove();
        }
      } catch (error) {
        console.warn('[Ayer navigation]', error.message);
      }
    }
    if (ticket === requestId) notify('ayer:page-ready', false);
  }

  function updateHead(nextDocument, url) {
    document.title = nextDocument.title;
    ['meta[name="description"]', 'meta[name="keywords"]', 'link[rel="canonical"]'].forEach(function (selector) {
      var current = document.head.querySelector(selector);
      var next = nextDocument.head.querySelector(selector);
      if (current) current.remove();
      if (next) document.head.appendChild(document.importNode(next, true));
    });
    nextDocument.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
      var href = new URL(link.getAttribute('href'), url).href;
      var exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(function (item) { return item.href === href; });
      if (!exists) {
        var clone = document.importNode(link, true);
        clone.href = href;
        document.head.appendChild(clone);
      }
    });
  }

  async function navigate(href, options) {
    options = options || {};
    var url = new URL(href, location.href);
    if (url.origin !== location.origin) { location.assign(url.href); return false; }
    var ticket = ++requestId;
    if (controller) controller.abort();
    controller = new AbortController();
    var pageController = controller;
    clearTimeout(pendingScroll);
    if (!options.popstate) saveScroll();

    if (url.pathname === currentURL.pathname && url.search === currentURL.search) {
      if (!options.popstate && url.href !== location.href) history.pushState({ ayer: true }, '', url.href);
      currentURL = url;
      closeOverlays(false);
      setBusy(false);
      restoreScroll(url, options.state, !options.popstate);
      return true;
    }

    setBusy(true);
    var timeout = setTimeout(function () { pageController.abort(); }, 15000);
    try {
      var response = await fetch(url.href, { signal: pageController.signal, credentials: 'same-origin', headers: { 'X-Ayer-Navigation': 'true' } });
      if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('Not a blog document');
      var responseURL = new URL(response.url);
      if (responseURL.origin !== location.origin) throw new Error('Cross-origin redirect');
      responseURL.hash = url.hash;
      var html = await response.text();
      if (ticket !== requestId) return false;
      var nextDocument = new DOMParser().parseFromString(html, 'text/html');
      var nextMain = nextDocument.querySelector('main[data-ayer-page]');
      if (!nextMain) throw new Error('Document has no persistent blog shell');
      var scripts = Array.from(nextMain.querySelectorAll('script'));
      scripts.forEach(function (script) { script.remove(); });

      notify('ayer:before-swap', false);
      closeOverlays(false);
      if (window.ayerImageViewer) window.ayerImageViewer.close();
      document.querySelectorAll('[data-ayer-page-portal]').forEach(function (element) { element.remove(); });
      if (window.jQuery && jQuery.fn.justifiedGallery) jQuery(main).find('#gallery').justifiedGallery('destroy');
      if (window.tocbot) tocbot.destroy();
      if (window.ayerTyped && typeof window.ayerTyped.destroy === 'function') window.ayerTyped.destroy();
      window.ayerTyped = null;
      if (!options.popstate) history.pushState({ ayer: true, scrollTop: 0, scrollLeft: 0 }, '', responseURL.href);
      else if (responseURL.href !== location.href) history.replaceState(options.state || { ayer: true }, '', responseURL.href);
      currentURL = responseURL;
      updateHead(nextDocument, responseURL.href);
      nextMain.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) { link.remove(); });
      main.replaceChildren.apply(main, Array.from(nextMain.childNodes));
      if (window.matchMedia('(max-width: 768px)').matches) {
        main.classList.remove('on');
        document.querySelector('.sidebar').classList.remove('on');
      }
      initPage(false);
      main.focus({ preventScroll: true });
      restoreScroll(responseURL, options.state, false);
      // Fonts and images can settle one frame after the new content is attached.
      requestAnimationFrame(function () {
        if (ticket === requestId) restoreScroll(responseURL, options.state, false);
      });
      if (window._hmt) window._hmt.push(['_trackPageview', responseURL.pathname + responseURL.search]);
      if (typeof window.ga === 'function') window.ga('send', 'pageview', responseURL.pathname);
      // Optional remote widgets must not keep navigation or music waiting.
      runPageScripts(scripts, responseURL.href, ticket);
      return true;
    } catch (error) {
      if (ticket !== requestId) return false;
      console.warn('[Ayer navigation] Falling back to a full page load:', error.message);
      if (options.popstate) location.replace(url.href);
      else location.assign(url.href);
      return false;
    } finally {
      clearTimeout(timeout);
      if (ticket === requestId) setBusy(false);
    }
  }

  function share(type, opener) {
    var url = encodeURIComponent(location.href);
    var title = encodeURIComponent(document.title);
    var image = main.querySelector('.article-entry img');
    var picture = encodeURIComponent(image ? image.src : '');
    var destinations = {
      weibo: 'https://service.weibo.com/share/share.php?url=' + url + '&title=' + title + '&pic=' + picture,
      qq: 'https://connect.qq.com/widget/shareqq/index.html?url=' + url + '&title=' + title + '&pics=' + picture,
      qzone: 'https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=' + url + '&title=' + title + '&pics=' + picture,
      facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + url,
      twitter: 'https://twitter.com/intent/tweet?text=' + title + '&url=' + url
    };
    if (type === 'weixin') {
      var dialog = document.querySelector('.wx-share-modal');
      modalOpener = opener;
      dialog.classList.add('in', 'ready');
      dialog.setAttribute('aria-hidden', 'false');
      document.getElementById('share-mask').style.display = 'block';
      var close = dialog.querySelector('.modal-close');
      if (close) close.focus({ preventScroll: true });
    } else if (destinations[type]) window.open(destinations[type], '_blank', 'noopener,noreferrer');
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest && event.target.closest('.navbar-toggle, .nav-item-search, .local-search-close, .share-outer, .share-sns[data-type], #reward-btn, #reward .close, #mask, #share-mask, .modal-close, #totop, .anchor');
    if (target) {
      event.preventDefault();
      if (target.matches('.navbar-toggle')) {
        main.classList.toggle('on');
        document.querySelector('.sidebar').classList.toggle('on');
        syncSidebar();
      } else if (target.matches('.nav-item-search')) {
        document.querySelector('.search-form-wrap').classList.add('on');
        document.querySelector('.local-search-input').focus();
      } else if (target.matches('.share-outer')) {
        var wrap = target.parentNode.querySelector('.share-wrap');
        wrap.style.display = getComputedStyle(wrap).display === 'none' ? 'block' : 'none';
      } else if (target.matches('.share-sns[data-type]')) share(target.dataset.type, target);
      else if (target.matches('#reward-btn')) {
        var reward = document.getElementById('reward');
        modalOpener = target;
        reward.style.display = 'block';
        reward.setAttribute('aria-hidden', 'false');
        document.getElementById('mask').style.display = 'block';
        var close = reward.querySelector('.close');
        if (close) close.focus({ preventScroll: true });
      } else if (target.matches('#totop, .anchor')) {
        var cover = main.querySelector('.cover');
        main.scrollTo({ top: target.matches('.anchor') && cover ? cover.offsetHeight : 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      } else closeOverlays();
      return;
    }

    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || link.hasAttribute('data-no-pjax') || link.closest('[data-no-pjax]') || (link.target && link.target !== '_self') || /\bexternal\b/i.test(link.rel)) return;
    var url = new URL(link.href, location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
    var filename = url.pathname.split('/').pop();
    if (/\.[a-z0-9]+$/i.test(filename) && !/\.html?$/i.test(filename)) return;
    // Hash-only actions without a destination belong to their component.
    if (link.getAttribute('href') === '#') return;
    event.preventDefault();
    navigate(url.href);
  });

  document.addEventListener('pointerdown', function (event) {
    if (!event.target.closest('.search-form-wrap, .nav-item-search')) document.querySelector('.search-form-wrap').classList.remove('on');
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeOverlays();
    if (event.key !== 'Tab') return;
    var dialog = document.querySelector('.wx-share-modal[aria-hidden="false"], #reward[aria-hidden="false"]');
    if (!dialog) return;
    var controls = Array.from(dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')).filter(function (element) {
      return !element.disabled && element.getClientRects().length;
    });
    if (!controls.length) return;
    var first = controls[0];
    var last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  main.addEventListener('scroll', function () {
    updateTopButton();
    clearTimeout(pendingScroll);
    pendingScroll = setTimeout(saveScroll, 100);
  }, { passive: true });
  window.addEventListener('popstate', function (event) { navigate(location.href, { popstate: true, state: event.state }); });
  window.addEventListener('pagehide', saveScroll);
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState(Object.assign({ ayer: true, scrollTop: main.scrollTop, scrollLeft: main.scrollLeft }, history.state), '', location.href);
  window.AyerNavigation = { navigate: navigate };
  initPage(true);
  if (location.hash) requestAnimationFrame(function () { restoreScroll(currentURL, null, false); });
})();
