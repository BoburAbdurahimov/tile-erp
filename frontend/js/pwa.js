// Installing the ERP as an app on a phone or computer (PWA).
// Registers the service worker and shows the "Ilovani o'rnatish" buttons
// ([data-pwa-install]) when the app can be installed: the browser's own
// install prompt on Android / Chrome / Edge, and the Share -> "Add to Home
// Screen" steps on iPhone / iPad, where Safari has no install prompt.
// Hidden when already running as the installed app or inside Telegram.
const PWA = (() => {
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  const inTelegram = () =>
    !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);

  // iPadOS Safari reports itself as a Mac, so a touch screen gives it away.
  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function canInstall() {
    if (isStandalone() || inTelegram()) return false;
    return !!deferredPrompt || isIOS();
  }

  function refresh() {
    const show = canInstall();
    document.querySelectorAll("[data-pwa-install]").forEach(el => {
      el.style.display = show ? "" : "none";
    });
    document.querySelectorAll("[data-pwa-install] [data-i18n]").forEach(el => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
  }

  async function install() {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;          // a prompt can be shown only once
      prompt.prompt();
      try { await prompt.userChoice; } catch (e) { /* dismissed */ }
      refresh();
      return;
    }
    if (isIOS()) showIosSteps();
  }

  function closeIosSteps() {
    const el = document.getElementById("pwa-ios-sheet");
    if (el) el.remove();
  }

  function showIosSteps() {
    closeIosSteps();
    const shareIcon = `<svg class="pwa-ios-share" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    const sheet = document.createElement("div");
    sheet.id = "pwa-ios-sheet";
    sheet.className = "pwa-ios-sheet";
    sheet.innerHTML = `
      <div class="pwa-ios-card" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title">
        <div class="pwa-ios-head">
          <img src="/static/icons/icon-192.png" alt="" width="48" height="48" />
          <div>
            <div class="pwa-ios-title" id="pwa-ios-title">${t("pwa_ios_title")}</div>
            <div class="pwa-ios-sub">Kafel Zavodi ERP</div>
          </div>
        </div>
        <ol class="pwa-ios-steps">
          <li>${t("pwa_ios_step1")} ${shareIcon}</li>
          <li>${t("pwa_ios_step2")}</li>
          <li>${t("pwa_ios_step3")}</li>
        </ol>
        <button type="button" class="pwa-ios-close">${t("pwa_ios_ok")}</button>
      </div>`;
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet || e.target.classList.contains("pwa-ios-close")) closeIosSteps();
    });
    document.body.appendChild(sheet);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();               // show our own button instead of the mini-infobar
    deferredPrompt = e;
    refresh();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    refresh();
    if (typeof showToast === "function") showToast(t("pwa_installed"), "success");
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(err => console.log("Service worker:", err));
    });
  }

  document.addEventListener("DOMContentLoaded", refresh);

  return { install, refresh, canInstall };
})();
