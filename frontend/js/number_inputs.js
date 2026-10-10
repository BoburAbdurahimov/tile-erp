// Number inputs show their digits in groups of three: 5 000 000.
//
// A type="number" input cannot hold spaces, so every one on the page becomes
// a text input that groups the digits as they are typed. Its .value still
// reads the plain number ("5000000"), so the code reading the forms is
// unchanged, and setting .value groups it. What type="number" checked is
// checked here: min and max, whole numbers unless step allows a fraction.
// A minus sign is taken only where min is below 0 or on data-signed inputs.
// <input type="number" data-plain> is left as it is.
(function () {
  const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  // data-num: one done already (a copy made with cloneNode is done again)
  const SELECTOR = 'input[type="number"]:not([data-plain]), input[data-num]';

  // "5 000 000" -> "5000000", "12,5" -> "12.5"
  function plain(text) {
    return String(text == null ? "" : text).replace(/[\s ]/g, "").replace(/,/g, ".");
  }

  // "-1234567.5" -> "-1 234 567.5"
  function grouped(text) {
    const m = /^(-?)(\d*)(.*)$/.exec(text);
    return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, " ") + m[3];
  }

  function isNumber(text) {
    return text !== "" && isFinite(Number(text));
  }

  function attr(el, name) {
    const v = el.getAttribute(name);
    return v === null || v.trim() === "" ? null : Number(v);
  }

  function takesFraction(el) {
    const step = attr(el, "step");           // step="any" reads as NaN
    return step !== null && !Number.isInteger(step);
  }

  function takesMinus(el) {
    const min = attr(el, "min");
    return el.hasAttribute("data-signed") || (min !== null && min < 0);
  }

  // What was typed, kept to a number: digits, one decimal point where the
  // field takes fractions, a leading minus where it takes negatives.
  function tidy(el, text) {
    const s = plain(text);
    const minus = takesMinus(el) && s.startsWith("-") ? "-" : "";
    let rest = s.replace(/[^\d.]/g, "");
    const dot = rest.indexOf(".");
    if (dot >= 0) {
      rest = rest.slice(0, dot) + (takesFraction(el) ? "." : "") + rest.slice(dot + 1).replace(/\./g, "");
    }
    return minus + rest;
  }

  function say(uz, ru) {
    return typeof CURRENT_LANG !== "undefined" && CURRENT_LANG === "ru" ? ru : uz;
  }

  function check(el) {
    const v = plain(native.get.call(el));
    const min = attr(el, "min"), max = attr(el, "max");
    let msg = "";
    if (v !== "" && !isNumber(v)) msg = say("Raqam kiriting", "Введите число");
    else if (v !== "" && min !== null && Number(v) < min) msg = say(`Kamida ${grouped(String(min))}`, `Не меньше ${grouped(String(min))}`);
    else if (v !== "" && max !== null && Number(v) > max) msg = say(`Ko'pi bilan ${grouped(String(max))}`, `Не больше ${grouped(String(max))}`);
    el.setCustomValidity(msg);
  }

  // Runs before the field's own oninput (capture), so that reads the tidied value.
  function onInput(e) {
    const el = e.target;
    if (!el || !el._grouped) return;
    const typed = native.get.call(el);
    const caret = el.selectionStart == null ? typed.length : el.selectionStart;
    const before = tidy(el, typed.slice(0, caret)).length;    // characters kept left of the caret
    const shown = grouped(tidy(el, typed));
    if (shown !== typed) {
      native.set.call(el, shown);
      let pos = 0;
      for (let seen = 0; pos < shown.length && seen < before; pos++) {
        if (shown[pos] !== " ") seen++;
      }
      try { el.setSelectionRange(pos, pos); } catch (_) { /* not focused */ }
    }
    check(el);
  }

  function enhance(el) {
    if (el._grouped) return;
    el._grouped = true;
    const current = native.get.call(el);
    el.setAttribute("data-num", "");
    el.type = "text";
    if (!el.hasAttribute("data-signed")) el.inputMode = takesFraction(el) ? "decimal" : "numeric";
    el.autocomplete = "off";
    Object.defineProperty(el, "value", {
      configurable: true,
      get() {
        const v = plain(native.get.call(this));
        return isNumber(v) ? v : "";
      },
      set(v) {
        const s = plain(v);
        native.set.call(this, isNumber(s) ? grouped(s) : "");
        check(this);
      },
    });
    el.value = current;
  }

  function scan(root) {
    if (root.matches && root.matches(SELECTOR)) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll(SELECTOR).forEach(enhance);
  }

  document.addEventListener("input", onInput, true);
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) if (node.nodeType === 1) scan(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
})();
