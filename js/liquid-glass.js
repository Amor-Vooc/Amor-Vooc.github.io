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
