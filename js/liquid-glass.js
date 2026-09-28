/*
 * Shape-aware liquid glass.
 * Like the supplied reference: backdrop blur -> SVG displacement -> saturation.
 * Unlike stretching a single capsule texture, each map follows the element's
 * four computed corner radii. Only the backdrop is bent; text remains sharp.
 */
(function () {
  'use strict';

  if (window.AyerLiquidGlass) {
    window.AyerLiquidGlass.refresh();
    return;
  }

  var NS = 'http://www.w3.org/2000/svg';
  var SELECTOR = '.liquid-glass, .glass-button';
  var THEMES = ['light', 'dark', 'dim'];
  var STORAGE_KEY = 'ayer-glass-theme';
  var OVERSCAN = 192;
  var MAX_PIXELS = 524288;
  var records = new Map();
  var pending = new Set();
  var serial = 0;
  var frame = 0;
  var scrollFrame = 0;
  var scanFrame = 0;
  var suspended = false;
  var svg;
  var defs;
  var supported = !!(window.CSS && CSS.supports &&
    CSS.supports('backdrop-filter', 'blur(1px) url("#ayer-glass-probe")'));

  function node(name, attributes) {
    var result = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      result.setAttribute(key, attributes[key]);
    });
    return result;
  }

  function ensureDefinitions() {
    if (svg && svg.isConnected) return;
    svg = node('svg', { id: 'ayer-glass-filters', width: 0, height: 0,
      'aria-hidden': 'true', focusable: 'false' });
    // display:none disables referenced filters in several browser engines.
    svg.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;overflow:hidden;';
    defs = node('defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  function radius(value, width, height) {
    var parts = value.trim().split(/\s+/);
    function length(part, basis) {
      return Math.max(0, (parseFloat(part) || 0) * (part.indexOf('%') >= 0 ? basis / 100 : 1));
    }
    return [length(parts[0], width), length(parts[1] || parts[0], height)];
  }

  function geometry(element) {
    var rect = element.getBoundingClientRect();
    // offset dimensions avoid baking hover transforms into the optical shape.
    var width = element.offsetWidth || rect.width;
    var height = element.offsetHeight || rect.height;
    var css = getComputedStyle(element);
    var radii = [css.borderTopLeftRadius, css.borderTopRightRadius,
      css.borderBottomRightRadius, css.borderBottomLeftRadius].map(function (r) {
      return radius(r, width, height);
    });
    var factor = Math.min(1,
      width / (radii[0][0] + radii[1][0] || 1),
      width / (radii[3][0] + radii[2][0] || 1),
      height / (radii[0][1] + radii[3][1] || 1),
      height / (radii[1][1] + radii[2][1] || 1));
    radii.forEach(function (r) { r[0] *= factor; r[1] *= factor; });
    return { width: width, height: height, radii: radii, rect: rect,
      strength: parseFloat(css.getPropertyValue('--liquid-refraction-strength')) || 1,
      hidden: css.display === 'none' || css.visibility === 'hidden' };
  }

  function visible(rect) {
    return rect.bottom > -OVERSCAN && rect.top < innerHeight + OVERSCAN &&
      rect.right > -OVERSCAN && rect.left < innerWidth + OVERSCAN;
  }

  function release(record) {
    if (record.filter) record.filter.remove();
    record.filter = null;
    record.key = '';
    record.element.style.removeProperty('--liquid-filter');
    record.element.removeAttribute('data-glass-filter');
    record.element.removeAttribute('data-glass-shape');
    pending.delete(record);
  }

  function remove(record) {
    release(record);
    if (resizeObserver) resizeObserver.unobserve(record.element);
    if (intersectionObserver) intersectionObserver.unobserve(record.element);
    records.delete(record.element);
  }

  function enqueue(record) {
    if (suspended || !supported || !record.visible) return;
    pending.add(record);
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function flush() {
    frame = 0;
    if (suspended) return;
    var start = performance.now();
    // Budget map generation across frames instead of blocking page navigation.
    while (pending.size && performance.now() - start < 7) {
      var record = pending.values().next().value;
      pending.delete(record);
      if (!record.element.isConnected) remove(record);
      else if (record.visible) render(record);
    }
    if (pending.size) frame = requestAnimationFrame(flush);
  }

  function render(record) {
    var shape = geometry(record.element);
    var width = shape.width;
    var height = shape.height;
    if (width < 2 || height < 2 || shape.hidden) {
      release(record);
      return;
    }

    // Crop exceptionally tall surfaces to a viewport-sized filter region.
    // Coordinates remain relative to the full shape, so the side wall is
    // straight in the middle of an article and curved only at its true ends.
    var sliced = height > Math.max(1600, innerHeight + OVERSCAN * 2);
    var y = sliced ? Math.max(0, Math.floor((-shape.rect.top - OVERSCAN) / 96) * 96) : 0;
    y = Math.min(y, Math.max(0, height - innerHeight - OVERSCAN * 3));
    var bandHeight = sliced ? Math.min(height - y, innerHeight + OVERSCAN * 3) : height;
    var key = [width, height, y, bandHeight, shape.radii.flat().join(','), shape.strength].join(':');
    if (key === record.key) return;

    var shortSide = Math.min(width, height);
    var cornerSize = Math.max.apply(null, shape.radii.flat());
    var bevel = Math.min(shortSide / 2, Math.max(12, Math.min(48, cornerSize * 1.15)));
    var scale = Math.min(64, Math.max(20, shortSide * 0.58)) * shape.strength;
    var padding = Math.ceil(scale / 2 + 12);
    var mapX = -padding;
    var mapY = y - padding;
    var mapWidth = width + padding * 2;
    var mapHeight = bandHeight + padding * 2;
    var density = Math.min(1, 1200 / mapWidth, 1600 / mapHeight,
      Math.sqrt(MAX_PIXELS / (mapWidth * mapHeight)));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.floor(mapWidth * density));
    canvas.height = Math.max(2, Math.floor(mapHeight * density));
    var context = canvas.getContext('2d');
    if (!context) return;
    var bitmap = context.createImageData(canvas.width, canvas.height);
    var data = bitmap.data;
    var radii = shape.radii;
    var pixel = 0;

    for (var row = 0; row < canvas.height; row++) {
      var py = mapY + (row + 0.5) * mapHeight / canvas.height;
      for (var column = 0; column < canvas.width; column++, pixel += 4) {
        var px = mapX + (column + 0.5) * mapWidth / canvas.width;
        var distance = py;
        var nx = 0;
        var ny = -1;
        if (height - py < distance) { distance = height - py; ny = 1; }
        if (px < distance) { distance = px; nx = -1; ny = 0; }
        if (width - px < distance) { distance = width - px; nx = 1; ny = 0; }

        var corner = -1;
        if (px < radii[0][0] && py < radii[0][1]) corner = 0;
        else if (px > width - radii[1][0] && py < radii[1][1]) corner = 1;
        else if (px > width - radii[2][0] && py > height - radii[2][1]) corner = 2;
        else if (px < radii[3][0] && py > height - radii[3][1]) corner = 3;

        if (corner >= 0 && radii[corner][0] && radii[corner][1]) {
          var rx = radii[corner][0];
          var ry = radii[corner][1];
          var cx = corner === 0 || corner === 3 ? rx : width - rx;
          var cy = corner < 2 ? ry : height - ry;
          var qx = (px - cx) / rx;
          var qy = (py - cy) / ry;
          var length = Math.sqrt(qx * qx + qy * qy) || 1;
          var gx = qx / rx;
          var gy = qy / ry;
          var gradient = Math.sqrt(gx * gx + gy * gy) || 1;
          distance = (1 - length) * Math.min(rx, ry);
          nx = gx / gradient;
          ny = gy / gradient;
        }

        var bend = 0;
        if (distance >= -1 && distance < bevel) {
          // The rounded rim is a convex glass surface (IOR 1.5). Snell's law
          // gives a strong rolled edge, smoothly returning to neutral inside.
          var t = Math.min(1, Math.max(0, distance / bevel));
          var normal = 1 - t;
          var incident = Math.asin(normal);
          var refracted = Math.asin(normal / 1.5);
          bend = Math.min(1, Math.tan(incident - refracted) / 1.12);
          bend *= Math.min(1, (distance + 1) * 2);
        }
        data[pixel] = Math.round(127.5 - nx * bend * 127);
        data[pixel + 1] = Math.round(127.5 - ny * bend * 127);
        data[pixel + 2] = 128;
        data[pixel + 3] = 255;
      }
    }
    context.putImageData(bitmap, 0, 0);
    var map = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 1;

    ensureDefinitions();
    if (!record.filter) {
      record.id = 'ayer-glass-' + (++serial);
      record.filter = node('filter', { id: record.id,
        filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB' });
      record.image = node('feImage', { result: 'glass-map', preserveAspectRatio: 'none' });
      record.blur = node('feGaussianBlur', { in: 'SourceGraphic',
        stdDeviation: '0.7', result: 'glass-source' });
      record.displacement = node('feDisplacementMap', { in: 'glass-source',
        in2: 'glass-map', xChannelSelector: 'R', yChannelSelector: 'G' });
      record.filter.appendChild(record.image);
      record.filter.appendChild(record.blur);
      record.filter.appendChild(record.displacement);
      defs.appendChild(record.filter);
    }
    [record.filter, record.image].forEach(function (element) {
      element.setAttribute('x', mapX);
      element.setAttribute('y', mapY);
      element.setAttribute('width', mapWidth);
      element.setAttribute('height', mapHeight);
    });
    record.image.setAttribute('href', map);
    record.displacement.setAttribute('scale', scale.toFixed(2));
    record.element.style.setProperty('--liquid-filter', 'url("#' + record.id + '")');
    record.element.dataset.glassFilter = record.id;
    record.element.dataset.glassShape = width + 'x' + height + ':' + shape.radii.flat().join(',');
    record.key = key;
    record.sliced = sliced;
  }

  var resizeObserver = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      var record = records.get(entry.target);
      if (record) enqueue(record);
    });
  }) : null;

  var intersectionObserver = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var record = records.get(entry.target);
      if (!record) return;
      record.visible = entry.isIntersecting;
      if (record.visible) enqueue(record);
      else release(record);
    });
  }, { rootMargin: OVERSCAN + 'px' }) : null;

  function refresh() {
    if (suspended || !document.body) return;
    applyTheme(currentTheme(), false);
    if (!supported) return;
    ensureDefinitions();
    records.forEach(function (record) {
      if (!record.element.isConnected || !record.element.matches(SELECTOR)) remove(record);
    });
    document.querySelectorAll(SELECTOR).forEach(function (element) {
      // Only standalone buttons may add a second surface inside a glass box.
      // Dense controls (navigation, theme switcher, player) share their shell.
      var parent = element.parentElement && element.parentElement.closest(SELECTOR);
      var isButton = element.classList.contains('glass-button');
      if (parent && (!isButton || parent.matches('nav, #glass-theme-switcher, .aplayer, .glass-toolbar'))) {
        if (records.has(element)) remove(records.get(element));
        element.style.setProperty('--liquid-filter', 'blur(0px)');
        return;
      }
      var record = records.get(element);
      if (!record) {
        record = { element: element, visible: visible(element.getBoundingClientRect()) };
        records.set(element, record);
        if (resizeObserver) resizeObserver.observe(element);
        if (intersectionObserver) intersectionObserver.observe(element);
      }
      enqueue(record);
    });
  }

  function currentTheme() {
    var saved;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (error) { /* Private mode. */ }
    return THEMES.indexOf(saved) >= 0 ? saved :
      (THEMES.indexOf(document.documentElement.dataset.glassTheme) >= 0 ? document.documentElement.dataset.glassTheme : 'light');
  }

  function applyTheme(theme, persist) {
    if (THEMES.indexOf(theme) < 0) theme = 'light';
    var root = document.documentElement;
    var previous = root.dataset.glassTheme;
    root.dataset.glassTheme = theme;
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    var switcher = document.getElementById('glass-theme-switcher');
    if (switcher) {
      if (THEMES.indexOf(previous) >= 0 && theme !== previous) {
        switcher.setAttribute('c-previous', String(THEMES.indexOf(previous) + 1));
      } else if (!switcher.hasAttribute('c-previous')) {
        switcher.setAttribute('c-previous', String(THEMES.indexOf(theme) + 1));
      }
      switcher.querySelectorAll('input[name="glass-theme"]').forEach(function (input) {
        input.checked = input.value === theme;
      });
    }
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (error) { /* Private mode. */ }
    }
    if (theme !== previous) document.dispatchEvent(new CustomEvent('ayer:theme-change', { detail: { theme: theme } }));
  }

  document.addEventListener('change', function (event) {
    var input = event.target;
    if (!input.matches('#glass-theme-switcher input[name="glass-theme"]') || !input.checked) return;
    var switcher = input.closest('#glass-theme-switcher');
    switcher.setAttribute('c-previous', String(THEMES.indexOf(currentTheme()) + 1));
    applyTheme(input.value, true);
  });

  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) applyTheme(currentTheme(), false);
  });

  window.addEventListener('scroll', function () {
    if (scrollFrame || suspended) return;
    scrollFrame = requestAnimationFrame(function () {
      scrollFrame = 0;
      records.forEach(function (record) {
        if (!intersectionObserver) {
          record.visible = visible(record.element.getBoundingClientRect());
          if (!record.visible) release(record);
        }
        // A fixed scroll-to-top button may change visibility without resizing
        // or crossing an intersection threshold; restore its released filter.
        if (record.visible && (record.sliced || !record.filter || !intersectionObserver)) enqueue(record);
      });
    });
  // The theme scrolls main.content; scroll does not bubble from that container.
  }, { passive: true, capture: true });

  window.addEventListener('resize', function () { records.forEach(enqueue); }, { passive: true });

  document.addEventListener('ayer:before-swap', function () {
    suspended = true;
    records.forEach(remove);
    pending.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  });
  document.addEventListener('ayer:page-ready', function () { suspended = false; refresh(); });

  function start() {
    document.documentElement.dataset.glassRefraction = supported ? 'svg' : 'blur';
    refresh();
    if (window.MutationObserver) new MutationObserver(function (changes) {
      var meaningful = changes.some(function (change) {
        return !(svg && svg.contains(change.target)) &&
          Array.from(change.addedNodes).concat(Array.from(change.removedNodes)).some(function (added) {
          return added.nodeType === 1 && (added.matches(SELECTOR) || added.querySelector(SELECTOR));
        });
      });
      if (meaningful && !scanFrame && !suspended) scanFrame = requestAnimationFrame(function () {
        scanFrame = 0;
        refresh();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.AyerLiquidGlass = { refresh: refresh, setTheme: function (theme) { applyTheme(theme, true); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
