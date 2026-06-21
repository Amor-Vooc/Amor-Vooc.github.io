(function () {
  const trackPrevious = (el) => {
    if (!el) return;
    const radios = el.querySelectorAll('input[type="radio"]');
    let previousValue = null;
    const initiallyChecked = el.querySelector('input[type="radio"]:checked');

    if (initiallyChecked) {
      previousValue = initiallyChecked.getAttribute("c-option");
      el.setAttribute("c-previous", previousValue);
    }

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        el.setAttribute("c-previous", previousValue || "");
        previousValue = radio.getAttribute("c-option");
      });
    });
  };

  document.querySelectorAll(".switcher").forEach(trackPrevious);

  const portalArticleToc = () => {
    const toc = document.querySelector(".tocbot");
    if (!toc || toc.parentElement === document.body) return;
    toc.classList.add("liquid-toc-fixed");
    document.body.appendChild(toc);
  };

  portalArticleToc();

  const sidebar = document.querySelector(".sidebar");
  const content = document.querySelector(".content");
  const sidebarButton = document.querySelector(".navbar-toggle");
  const mobileQuery = window.matchMedia("(max-width: 768px)");

  const syncSidebarButton = () => {
    if (!sidebar || !sidebarButton) return;
    const isOpen = sidebar.classList.contains("on");
    sidebarButton.setAttribute("aria-expanded", String(isOpen));
    sidebarButton.setAttribute("aria-label", isOpen ? "收起侧边导航" : "展开侧边导航");
    sidebarButton.setAttribute("title", isOpen ? "收起侧边导航" : "展开侧边导航");
  };

  const closeMobileSidebar = () => {
    if (!mobileQuery.matches || !sidebar) return;
    sidebar.classList.remove("on");
    content && content.classList.remove("on");
    syncSidebarButton();
  };

  if (sidebar && sidebarButton) {
    if (!sidebar.id) sidebar.id = "site-sidebar";
    sidebarButton.setAttribute("aria-controls", sidebar.id);
    sidebarButton.setAttribute("type", "button");

    sidebarButton.addEventListener("click", () => requestAnimationFrame(syncSidebarButton));
    sidebar.querySelectorAll(".nav-item-link").forEach((link) => {
      link.addEventListener("click", closeMobileSidebar);
    });

    document.addEventListener("click", (event) => {
      if (!mobileQuery.matches || !sidebar.classList.contains("on")) return;
      if (sidebar.contains(event.target)) return;
      closeMobileSidebar();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMobileSidebar();
    });

    mobileQuery.addEventListener("change", () => {
      if (mobileQuery.matches) {
        closeMobileSidebar();
      } else {
        sidebar.classList.add("on");
        content && content.classList.add("on");
        syncSidebarButton();
      }
    });

    new MutationObserver(syncSidebarButton).observe(sidebar, { attributes: true, attributeFilter: ["class"] });
    syncSidebarButton();
  }

  const darkButton = document.getElementById("todark");
  if (!darkButton) return;

  darkButton.classList.add("liquid-toggle");

  const syncDarkButton = () => {
    const isDark = document.body.classList.contains("darkmode");
    darkButton.setAttribute("aria-pressed", String(isDark));
    darkButton.setAttribute("data-liquid-mode", isDark ? "dark" : "light");
    darkButton.setAttribute("title", isDark ? "切换到浅色模式" : "切换到深色模式");
  };

  syncDarkButton();
  darkButton.addEventListener("click", () => requestAnimationFrame(syncDarkButton));

  const observer = new MutationObserver(syncDarkButton);
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();
