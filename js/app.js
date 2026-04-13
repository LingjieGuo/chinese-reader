"use strict";

/* ── Global state ── */
let pyVisible   = false;
let inputOpen   = true;
let tutorialOpen = false;
let tutorialHideTimer = null;
let sideMenuPinned = false;
let highlightMode = false;
let highlightColor = "yellow";
let previewRawEditMode = false;
let previewRawDraft = "";
let previewRawOriginal = "";
const manualPinyinOverrides = new Map();
const HIGHLIGHT_COLOR_CLASSES = ["wu-hi-yellow", "wu-hi-red", "wu-hi-green", "wu-hi-blue"];
const INITIAL_READER_SCROLL_DELAY = 3000;
const INITIAL_READER_SCROLL_DURATION = 4500;
const LESSON_READER_SCROLL_DURATION = 2200;
const SCREEN_TRANSITION_SPAN = 0.78;

/* ════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════ */
window.addEventListener("DOMContentLoaded", () => {
  initHeroMotion();
  initSliders();
  initInputAutoResizeSync();
  initReadingPreviewEditing();
  initLessonSelector();
  syncPreviewEditButton();
  initSideMenuScrollFollower();
  /* set collapsible open height after layout stabilises */
  requestAnimationFrame(() => {
    const b = document.getElementById("inputBody");
    b.style.maxHeight = b.scrollHeight + "px";
  });
  loadSample({ scrollIntoView: false });
  scheduleInitialReaderScroll();
  /* Ensure toolbar is interactive immediately after a brief visual intro */
  window.setTimeout(forceEnableTools, 500);
});

/* ════════════════════════════════════════════════
   HERO MOTION
════════════════════════════════════════════════ */
function initHeroMotion() {
  document.body.classList.add("is-loaded");
  updateHeroMotion();
  window.addEventListener("scroll", updateHeroMotion, { passive: true });
  window.addEventListener("resize", updateHeroMotion);
}

function updateHeroMotion() {
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const viewport = Math.max(window.innerHeight || 1, 1);
  const progress = motionQuery.matches ? 0 : Math.min(1, Math.max(0, window.scrollY / (viewport * .86)));
  const titleProgress = Math.pow(progress, 1.45);
  const readerProgress = getReaderScreenProgress(viewport, motionQuery.matches);
  const toolsInput = Math.min(1, Math.max(0, (progress - .92) / .08));
  const toolsProgress = 1 - Math.pow(1 - toolsInput, 2);
  const lessonProgress = getScreenCenterProgress(".lesson-picker-card", viewport, motionQuery.matches);
  const infoProgress = getScreenCenterProgress(".reader-info-page", viewport, motionQuery.matches);
  document.body.classList.toggle("is-tools-ready", toolsProgress > .98 || motionQuery.matches);
  document.documentElement.style.setProperty("--hero-progress", progress.toFixed(4));
  document.documentElement.style.setProperty("--title-progress", titleProgress.toFixed(4));
  document.documentElement.style.setProperty("--reader-progress", readerProgress.toFixed(4));
  document.documentElement.style.setProperty("--tools-progress", toolsProgress.toFixed(4));
  document.documentElement.style.setProperty("--lesson-progress", lessonProgress.toFixed(4));
  document.documentElement.style.setProperty("--info-progress", infoProgress.toFixed(4));
}

function getScreenCenterProgress(selector, viewport, reduceMotion) {
  const screen = document.querySelector(selector);
  if (!screen) return 0;
  if (reduceMotion) return 1;
  const rect = screen.getBoundingClientRect();
  const screenCenter = rect.top + (rect.height / 2);
  const viewportCenter = viewport / 2;
  const distance = Math.abs(screenCenter - viewportCenter);
  const raw = 1 - (distance / (viewport * SCREEN_TRANSITION_SPAN));
  const clamped = Math.min(1, Math.max(0, raw));
  return 1 - Math.pow(1 - clamped, 3);
}

function getReaderScreenProgress(viewport, reduceMotion) {
  const readerScreen = document.querySelector(".reading-shell");
  if (!readerScreen) return 0;
  if (reduceMotion) return 1;

  const rect = readerScreen.getBoundingClientRect();
  if (rect.top > 0) {
    return getScreenCenterProgress(".reading-shell", viewport, reduceMotion);
  }

  const exitStartLine = viewport / 3;
  if (rect.bottom > exitStartLine) return 1;

  const raw = rect.bottom / exitStartLine;
  const clamped = Math.min(1, Math.max(0, raw));
  return 1 - Math.pow(1 - clamped, 2);
}

function initSideMenuScrollFollower() {
  updateSideMenuScrollPosition();
  window.addEventListener("scroll", updateSideMenuScrollPosition, { passive: true });
  window.addEventListener("resize", updateSideMenuScrollPosition);
}

function updateSideMenuScrollPosition() {
  const shell = document.querySelector(".reading-shell");
  const menu = document.querySelector(".side-menu-shell");
  const card = document.getElementById("readingCard");
  if (!shell || !menu || !card) return;

  const isMobile = window.matchMedia("(max-width: 580px)").matches;
  const viewportOffset = isMobile ? 12 : 18;
  const shellTop = shell.getBoundingClientRect().top + window.scrollY;
  const cardHeight = card.offsetHeight;
  const menuHeight = menu.offsetHeight;
  const maxTop = Math.max(0, cardHeight - menuHeight);
  const nextTop = Math.min(maxTop, Math.max(0, window.scrollY + viewportOffset - shellTop));
  menu.style.setProperty("--side-menu-top", `${Math.round(nextTop)}px`);
}

function scheduleSideMenuScrollPositionUpdate() {
  requestAnimationFrame(updateSideMenuScrollPosition);
}

/* Ensure toolbar is always interactive regardless of scroll animation state */
function forceEnableTools() {
  document.body.classList.add("is-tools-ready");
  document.documentElement.style.setProperty("--tools-progress", "1");
}

function scheduleInitialReaderScroll() {
  const target = document.getElementById("readingCard");
  if (!target) return;

  let userMoved = false;
  const markUserMoved = () => { userMoved = true; };
  const cleanup = () => {
    window.removeEventListener("wheel", markUserMoved);
    window.removeEventListener("touchstart", markUserMoved);
    window.removeEventListener("keydown", markUserMoved);
    window.removeEventListener("pointerdown", markUserMoved);
  };

  window.addEventListener("wheel", markUserMoved, { passive: true });
  window.addEventListener("touchstart", markUserMoved, { passive: true });
  window.addEventListener("keydown", markUserMoved);
  window.addEventListener("pointerdown", markUserMoved);

  window.setTimeout(() => {
    cleanup();
    if (userMoved || Math.abs(window.scrollY) > 6) {
      // User interacted before auto-scroll — still enable the toolbar so buttons work
      forceEnableTools();
      return;
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
      forceEnableTools();
      return;
    }
    slowScrollToElement(target, INITIAL_READER_SCROLL_DURATION);
  }, INITIAL_READER_SCROLL_DELAY);

  // Fallback: guarantee tools are enabled after the full animation window ends
  window.setTimeout(forceEnableTools, INITIAL_READER_SCROLL_DELAY + INITIAL_READER_SCROLL_DURATION + 300);
}

function slowScrollToElement(target, duration) {
  const startY = window.scrollY;
  const endY = startY + target.getBoundingClientRect().top;
  const distance = endY - startY;
  const startTime = performance.now();

  const smoothstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    window.scrollTo(0, startY + distance * smoothstep(progress));
    if (elapsed < duration) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ════════════════════════════════════════════════
   SLIDERS
════════════════════════════════════════════════ */
function initSliders() {
  const sliders = [
    { id:"csSlider", valId:"csVal", prop:"--char-size" },
    { id:"psSlider", valId:"psVal", prop:"--pinyin-size" },
  ];
  sliders.forEach(syncFontSizeControl);
}

function syncFontSizeControl(s) {
  const el = document.getElementById(s.id);
  const val = document.getElementById(s.valId);
  if (!el || !val) return;
  applyFontSizeValue(el, val, s.prop, Number(el.value || el.min || 0));
}

function clampFontSizeValue(el, rawValue) {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return Number(el.value || min);
  return Math.min(max, Math.max(min, Math.round(value)));
}

function applyFontSizeValue(el, val, prop, rawValue) {
  const next = clampFontSizeValue(el, rawValue);
  el.value = String(next);
  val.value = String(next);
  updateFontSliderVisual(el, val, next);
  document.documentElement.style.setProperty(prop, next + "px");
}

function toggleFontSlider(kind) {
  const target = document.querySelector(`.font-control[data-font-control="${kind}"]`);
  if (!target) return;
  const willOpen = !target.classList.contains("is-open");
  if (willOpen) {
    closeExpandedToolPanels({ keep: "font" });
  }

  document.querySelectorAll(".font-control[data-font-control]").forEach((control) => {
    const isTarget = control === target;
    const open = isTarget && willOpen;
    const button = control.querySelector(".font-toggle-btn");
    control.classList.toggle("is-open", open);
    if (button) {
      button.classList.toggle("active", open);
      button.setAttribute("aria-expanded", String(open));
    }
  });
}

function closeExpandedToolPanels(options = {}) {
  const keep = options.keep || "";
  if (keep !== "font") {
    document.querySelectorAll(".font-control[data-font-control]").forEach((control) => {
      const button = control.querySelector(".font-toggle-btn");
      control.classList.remove("is-open");
      if (button) {
        button.classList.remove("active");
        button.setAttribute("aria-expanded", "false");
      }
    });
  }
  if (keep !== "highlight" && highlightMode) {
    highlightMode = false;
    syncHighlightButton();
  }
  if (keep !== "tutorial" && tutorialOpen) {
    setTutorialOpen(false, { skipCloseOthers: true });
  }
}

function updateFontSliderVisual(el, val, next) {
  if (!el || !val) return; // Bug #3 fix: 防止 el 或 val 为 null/undefined 时调用 .closest() 报错
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const progress = max === min ? 0 : (next - min) / (max - min);
  const field = val.closest(".vertical-slider-field") || el.closest(".vertical-slider-field");
  if (field) {
    field.style.setProperty("--font-slider-progress", String(progress));
  }
  const label = val.id === "csVal" ? "汉字字号" : "拼音字号";
  val.value = String(next);
  val.textContent = String(next);
  val.setAttribute("aria-label", `${label} ${next}px`);
  val.title = `${next}px`;
}

function updateFontSizeInput(id, valId, prop) {
  const el = document.getElementById(id);
  const val = document.getElementById(valId);
  if (!el || !val) return;
  if (el.type !== "range" && val.value === "") return;
  const rawValue = el.type === "range" ? el.value : val.value;
  const next = clampFontSizeValue(el, rawValue);
  el.value = String(next);
  val.value = String(next);
  updateFontSliderVisual(el, val, next);
  document.documentElement.style.setProperty(prop, next + "px");
}

function commitFontSizeInput(id, valId, prop) {
  const el = document.getElementById(id);
  const val = document.getElementById(valId);
  if (!el || !val) return;
  applyFontSizeValue(el, val, prop, el.type === "range" ? el.value : val.value);
}

function updateFontValueInput(id, valId, prop) {
  const el = document.getElementById(id);
  const val = document.getElementById(valId);
  if (!el || !val || val.value === "") return;

  const raw = Number(val.value);
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  if (!Number.isFinite(raw) || raw < min || raw > max) return;

  applyFontSizeValue(el, val, prop, raw);
}

function commitFontValueInput(id, valId, prop) {
  const el = document.getElementById(id);
  const val = document.getElementById(valId);
  if (!el || !val) return;
  applyFontSizeValue(el, val, prop, val.value === "" ? el.value : val.value);
}

function handleFontValueKey(event, id, valId, prop) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  commitFontValueInput(id, valId, prop);
  event.currentTarget.blur();
}

/* ════════════════════════════════════════════════
   PINYIN CONTROLS
════════════════════════════════════════════════ */
function toggleWord(wu) {
  if (highlightMode) {
    toggleWordHighlight(wu);
    return;
  }
  const py = wu.querySelector(".py");
  if (!py) return;
  py.classList.toggle("py-on");
}

function clearWordHighlightClasses(wu) {
  wu.classList.remove("wu-hi", ...HIGHLIGHT_COLOR_CLASSES);
}

function applyWordHighlightColor(wu, color) {
  clearWordHighlightClasses(wu);
  wu.classList.add("wu-hi", `wu-hi-${color}`);
}

function toggleWordHighlight(wu) {
  const targetClass = `wu-hi-${highlightColor}`;
  if (wu.classList.contains(targetClass)) {
    clearWordHighlightClasses(wu);
    return;
  }
  applyWordHighlightColor(wu, highlightColor);
}

function getPinyinTargets(blockIndex, unitIndex) {
  const para = document.querySelector(`.para-block[data-block-index="${blockIndex}"]`);
  return {
    para,
    display: para ? para.querySelector(`.py[data-unit-index="${unitIndex}"]`) : null
  };
}

function getBlockSourceLine(blockIndex) {
  const para = document.querySelector(`.para-block[data-block-index="${blockIndex}"]`);
  return para ? (para.dataset.sourceLine || "") : "";
}

function getBlockLineIndex(blockIndex) {
  const para = document.querySelector(`.para-block[data-block-index="${blockIndex}"]`);
  return para ? (para.dataset.lineIndex || "") : "";
}

function getManualPinyinOverrideKey(lineIndex, sourceLine, unitIndex) {
  return `${lineIndex}::${sourceLine}::${unitIndex}`;
}

function getManualPinyinOverride(lineIndex, sourceLine, unitIndex) {
  return manualPinyinOverrides.get(getManualPinyinOverrideKey(lineIndex, sourceLine, unitIndex));
}

function setManualPinyinOverride(lineIndex, sourceLine, unitIndex, value) {
  if (lineIndex === "" || !sourceLine) return;
  const key = getManualPinyinOverrideKey(lineIndex, sourceLine, unitIndex);
  if (value) {
    manualPinyinOverrides.set(key, value);
    return;
  }
  manualPinyinOverrides.delete(key);
}

function setPinyinValue(blockIndex, unitIndex, value, options = {}) {
  const { keepVisible = false, skipDisplay = false } = options;
  const normalized = (value || "").replace(/\u00A0/g, " ").trim();
  const { para, display } = getPinyinTargets(blockIndex, unitIndex);
  const lineIndex = getBlockLineIndex(blockIndex);
  const sourceLine = getBlockSourceLine(blockIndex);
  const wordUnit = para ? para.querySelector(`.wu .py[data-unit-index="${unitIndex}"]`)?.parentElement : null;

  setManualPinyinOverride(lineIndex, sourceLine, unitIndex, normalized);

  if (display && !skipDisplay) {
    display.textContent = normalized || "\u00A0";
    display.classList.toggle("py-on", keepVisible || pyVisible || !!normalized);
  }

  if (display) {
    display.classList.toggle("py-empty", !normalized);
  }
  if (wordUnit) {
    wordUnit.classList.toggle("wu-no-py", !normalized);
  }
}

function selectElementText(el) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

function startInlinePinyinEdit(pyEl) {
  if (!pyEl || pyEl.classList.contains("py-p")) return;
  pyEl.dataset.lastValue = pyEl.textContent || "\u00A0";
  pyEl.classList.add("py-on", "py-editing");
  pyEl.setAttribute("contenteditable", "true");
  if (pyEl.textContent === "\u00A0") {
    pyEl.textContent = "";
  }
  pyEl.focus();
  selectElementText(pyEl);
}

function finishInlinePinyinEdit(pyEl) {
  if (!pyEl) return;
  const blockIndex = pyEl.dataset.blockIndex;
  const unitIndex = pyEl.dataset.unitIndex;
  const value = pyEl.textContent || "";
  pyEl.removeAttribute("contenteditable");
  pyEl.classList.remove("py-editing");
  setPinyinValue(blockIndex, unitIndex, value, { keepVisible: true });
  pyEl.dataset.lastValue = pyEl.textContent || "\u00A0";
}

function showAll() {
  document.querySelectorAll(".py:not(.py-p)").forEach(p => p.classList.add("py-on"));
}

function hideAll() {
  document.querySelectorAll(".py").forEach(p => p.classList.remove("py-on"));
}

function syncPinyinButton() {
  const btn = document.getElementById("pyBtn");
  if (!btn) return;
  btn.classList.toggle("active", pyVisible);
}

function syncHighlightButton() {
  const btn = document.getElementById("highlightBtn");
  const group = document.querySelector(".highlight-group");
  const palette = document.getElementById("highlightPalette");
  if (!btn) return;
  btn.classList.toggle("active", highlightMode);
  if (group) {
    group.classList.toggle("is-open", highlightMode);
  }
  if (palette) {
    palette.setAttribute("aria-hidden", highlightMode ? "false" : "true");
  }

  document.querySelectorAll(".color-chip").forEach(chip => {
    const isActiveColor = chip.dataset.color === highlightColor;
    chip.classList.toggle("active", isActiveColor);
    chip.disabled = !highlightMode;
  });
}

function togglePinyin() {
  pyVisible = !pyVisible;
  if (pyVisible) {
    showAll();
  } else {
    hideAll();
  }
  syncPinyinButton();
}

function toggleHighlightMode() {
  const willOpen = !highlightMode;
  if (willOpen) {
    closeExpandedToolPanels({ keep: "highlight" });
  }
  highlightMode = !highlightMode;
  syncHighlightButton();
  scheduleSideMenuScrollPositionUpdate();
}

function setHighlightColor(color) {
  highlightColor = color;
  syncHighlightButton();
  scheduleSideMenuScrollPositionUpdate();
}

function printReadingContent() {
  if (previewRawEditMode) {
    commitPreviewRawEdit();
  }

  const area = document.getElementById("readingPreview");
  if (!area) return;

  const hasContent = area.querySelector(".para-block .wu, .para-block .ch");
  const isEmptyState = !!area.querySelector(".empty");
  if (!hasContent || isEmptyState) {
    alert("请先生成阅读内容，再进行打印。");
    return;
  }

  const activeEl = document.activeElement;
  if (activeEl && activeEl.classList && activeEl.classList.contains("py-editing")) {
    activeEl.blur();
  }

  window.print();
}

/* ════════════════════════════════════════════════
   COLLAPSIBLE TUTORIAL SECTION
════════════════════════════════════════════════ */
function setTutorialOpen(nextOpen, options = {}) {
  if (nextOpen && !options.skipCloseOthers) {
    closeExpandedToolPanels({ keep: "tutorial" });
  }
  tutorialOpen = nextOpen;
  const popover = document.getElementById("tutorialPopover");
  const fab = document.getElementById("tutorialFab");
  if (!popover || !fab) return;

  if (tutorialHideTimer) {
    clearTimeout(tutorialHideTimer);
    tutorialHideTimer = null;
  }

  if (tutorialOpen) {
    popover.hidden = false;
    popover.classList.remove("is-closing");
    popover.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (tutorialOpen) popover.classList.add("is-visible");
    });
  } else {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    popover.classList.remove("is-visible");
    popover.classList.add("is-closing");
    tutorialHideTimer = setTimeout(() => {
      tutorialHideTimer = null;
      if (tutorialOpen) return;
      popover.hidden = true;
      popover.classList.remove("is-closing");
    }, reduceMotion ? 0 : 180);
  }

  const expanded = tutorialOpen ? "true" : "false";
  fab.classList.toggle("active", tutorialOpen);
  fab.setAttribute("aria-expanded", expanded);
  fab.setAttribute("aria-label", tutorialOpen ? "收起使用教程 Close tutorial" : "打开使用教程 Open tutorial");
  scheduleSideMenuScrollPositionUpdate();
}

function toggleTutorialFromFab(event) {
  event?.stopPropagation();
  setTutorialOpen(!tutorialOpen);
}

function setSideMenuPinned(nextOpen) {
  sideMenuPinned = nextOpen;
  const menu = document.querySelector(".side-menu-shell");
  const handle = document.querySelector(".side-menu-handle");
  if (!menu || !handle) return;
  menu.classList.toggle("is-open", sideMenuPinned);
  handle.setAttribute("aria-expanded", sideMenuPinned ? "true" : "false");
}

function toggleSideMenu(event) {
  event?.stopPropagation();
  setSideMenuPinned(!sideMenuPinned);
}

document.addEventListener("click", (event) => {
  const menu = document.querySelector(".side-menu-shell");
  if (sideMenuPinned && menu && !menu.contains(event.target)) {
    setSideMenuPinned(false);
  }

  if (!tutorialOpen) return;
  const popover = document.getElementById("tutorialPopover");
  const fab = document.getElementById("tutorialFab");
  if (!popover || !fab) return;
  if (popover.contains(event.target) || fab.contains(event.target)) return;
  setTutorialOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (tutorialOpen) {
    setTutorialOpen(false);
  }
  if (sideMenuPinned) {
    setSideMenuPinned(false);
  }
});

/* ════════════════════════════════════════════════
   COLLAPSIBLE INPUT SECTION
════════════════════════════════════════════════ */
function toggleInput() {
  inputOpen = !inputOpen;
  const body = document.getElementById("inputBody");
  const ico  = document.getElementById("toggleIco");
  if (inputOpen) {
    /* animate open: briefly measure scrollHeight, then set it */
    body.style.maxHeight = body.scrollHeight + "px";
    ico.classList.remove("closed");
  } else {
    /* snapshot current height before collapsing (for smooth animation) */
    body.style.maxHeight = body.scrollHeight + "px";
    /* force reflow then animate to 0 */
    body.getBoundingClientRect();
    body.style.maxHeight = "0";
    ico.classList.add("closed");
  }
}

function refreshInputBodyHeight() {
  if (!inputOpen) return;
  const body = document.getElementById("inputBody");
  body.style.maxHeight = body.scrollHeight + "px";
}

function initInputAutoResizeSync() {
  const input = document.getElementById("customInput");
  if (!input) return;

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      refreshInputBodyHeight();
    });
    observer.observe(input);
  }

  input.addEventListener("mouseup", refreshInputBodyHeight);
  input.addEventListener("touchend", refreshInputBodyHeight, { passive: true });
}

function insertPlainTextAtCursor(text) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function normalizeEditorText(text) {
  return (text || "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function getReadingSourceText() {
  const input = document.getElementById("customInput");
  return input ? normalizeEditorText(input.value || "") : "";
}

function setReadingSourceText(raw) {
  const input = document.getElementById("customInput");
  if (!input) return;
  input.value = normalizeEditorText(raw);
  refreshInputBodyHeight();
}

let _previewEditListenerAdded = false; // Bug #13 fix: 防止重复注册监听器（内存泄漏）
function initReadingPreviewEditing() {
  const preview = document.getElementById("readingPreview");
  if (!preview) return;
  if (!_previewEditListenerAdded) {
    document.addEventListener("click", handlePreviewRawEditOutsideClick, true);
    _previewEditListenerAdded = true;
  }
}

function handlePreviewRawEditOutsideClick(event) {
  if (!previewRawEditMode) return;
  const preview = document.getElementById("readingPreview");
  if (!preview || preview.contains(event.target)) return;

  const editBtn = document.getElementById("previewEditBtn");
  const clickedEditButton = editBtn && editBtn.contains(event.target);
  commitPreviewRawEdit();

  if (clickedEditButton) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function syncPreviewEditButton() {
  const btn = document.getElementById("previewEditBtn");
  if (!btn) return;
  const editIcon = '<img class="tool-icon-img" src="icons/edit.svg" alt="" aria-hidden="true">';
  btn.classList.toggle("active", previewRawEditMode);
  btn.setAttribute("aria-label", previewRawEditMode ? "完成编辑 Done editing" : "编辑内容 Edit content");
  btn.setAttribute("title", previewRawEditMode ? "完成编辑 Done editing" : "编辑内容 Edit content");
  btn.innerHTML = previewRawEditMode
    ? editIcon + '<span class="btn-text"><span>完成编辑</span><span class="btn-text-en">Done Editing</span></span>'
    : editIcon + '<span class="btn-text"><span>编辑内容</span><span class="btn-text-en">Edit Content</span></span>';
}

function togglePreviewRawEdit() {
  if (previewRawEditMode) {
    commitPreviewRawEdit();
    return;
  }
  enterPreviewRawEdit();
}

function enterPreviewRawEdit() {
  const preview = document.getElementById("readingPreview");
  if (!preview || previewRawEditMode) return;

  previewRawEditMode = true;
  syncPreviewEditButton();
  previewRawOriginal = getReadingSourceText();
  previewRawDraft = previewRawOriginal;
  preview.classList.add("is-editing-raw");
  preview.setAttribute("contenteditable", "plaintext-only");
  preview.setAttribute("spellcheck", "false");
  preview.textContent = previewRawDraft;
  preview.focus();
  placeCaretAtEnd(preview);

  preview.oninput = () => {
    previewRawDraft = normalizeEditorText(preview.textContent || "");
    setReadingSourceText(previewRawDraft);
  };

  preview.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelPreviewRawEdit();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      commitPreviewRawEdit();
    }
  };

  preview.onpaste = (event) => {
    event.preventDefault();
    // Bug #6 fix: 使用更清晰的兼容写法，避免在 IE 已废弃的 window.clipboardData 上调用可能失败的方法
    const _clipboard = event.clipboardData || window.clipboardData;
    const pasted = _clipboard?.getData?.("text") || "";
    insertPlainTextAtCursor(pasted);
    previewRawDraft = normalizeEditorText(preview.textContent || "");
    setReadingSourceText(previewRawDraft);
  };
}

function placeCaretAtEnd(el) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function cleanupPreviewRawEdit() {
  const preview = document.getElementById("readingPreview");
  if (!preview) return;
  previewRawEditMode = false;
  syncPreviewEditButton();
  preview.classList.remove("is-editing-raw");
  preview.removeAttribute("contenteditable");
  preview.removeAttribute("spellcheck");
  preview.oninput = null;
  preview.onkeydown = null;
  preview.onpaste = null;
}

function commitPreviewRawEdit() {
  setReadingSourceText(previewRawDraft);
  cleanupPreviewRawEdit();
  generate({
    scrollIntoView: false,
    quietEmpty: true,
    resetInteractiveState: false
  });
}

function cancelPreviewRawEdit() {
  previewRawDraft = previewRawOriginal;
  setReadingSourceText(previewRawOriginal);
  cleanupPreviewRawEdit();
  generate({
    scrollIntoView: false,
    quietEmpty: true,
    resetInteractiveState: false
  });
}

/* ════════════════════════════════════════════════
   PARSER
   Input format: preserve each input line in the reading view
════════════════════════════════════════════════ */

/* Unicode ranges that count as CJK characters needing pinyin */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u{20000}-\u{2a6df}]/u;
function isCJK(ch) { return CJK_RE.test(ch); }
const DIGIT_PINYIN = {
  "0": "líng",
  "1": "yī",
  "2": "èr",
  "3": "sān",
  "4": "sì",
  "5": "wǔ",
  "6": "liù",
  "7": "qī",
  "8": "bā",
  "9": "jiǔ"
};
function isArabicDigit(ch) {
  return /^[0-9]$/.test(ch);
}
function isDigitString(text) {
  return /^[0-9]+$/.test(text);
}
function getDigitStringPinyin(text) {
  return [...text].map(ch => DIGIT_PINYIN[ch] || "").filter(Boolean).join(" ");
}
function hasPinyinLibAvailable() {
  return !!(window.pinyinPro && typeof window.pinyinPro.pinyin === "function");
}
function looksLikeChineseLine(text) {
  return [...text].some(isCJK);
}

function buildUnitsFromChinese(chinese) {
  const chars = [...chinese.trim()];
  const units = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (isArabicDigit(ch)) {
      let digitText = ch;
      while (i + 1 < chars.length && isArabicDigit(chars[i + 1])) {
        i++;
        digitText += chars[i];
      }
      units.push({ ch: digitText, py: getDigitStringPinyin(digitText), isPunct: false });
      continue;
    }

    if (isCJK(ch)) {
      units.push({ ch, py: "", isPunct: false, needsChinesePinyin: true });
      continue;
    }

    units.push({ ch, py: "", isPunct: true });
  }

  const chineseUnits = units.filter(unit => unit.needsChinesePinyin);
  const pinyinValues = generatePinyinForChars(chineseUnits.map(unit => unit.ch), { silent: true }) || [];

  chineseUnits.forEach((unit, index) => {
    unit.py = pinyinValues[index] || "";
    delete unit.needsChinesePinyin;
  });

  units.forEach(unit => {
    if (unit.needsChinesePinyin) {
      delete unit.needsChinesePinyin;
    }
  });

  return units;
}

/**
 * Parse raw text into an array of block objects:
 *   { units: [{ch,py,isPunct}…] }
 * Returns { blocks, warns }
 */
function parseText(raw) {
  const segments = raw.replace(/\r\n?/g, "\n").split("\n");

  const blocks = [];
  const warns  = [];

  segments.forEach((seg, idx) => {
    const label = `第 ${idx + 1} 行`;
    const zhLine = seg.trim();

    if (!zhLine) {
      blocks.push({ units: [], isEmpty: true });
      return;
    }

    if (!looksLikeChineseLine(zhLine)) {
      warns.push(`${label}：需要是汉语内容，已跳过。`);
      return;
    }

    const units = buildUnitsFromChinese(zhLine);
    units.forEach((unit, unitIndex) => {
      if (unit.isPunct) return;
      const override = getManualPinyinOverride(idx, zhLine, unitIndex);
      if (typeof override === "string") {
        unit.py = override;
      }
    });
    const chineseUnitCount = units.filter(unit => isCJK(unit.ch)).length;
    const filledChineseCount = units.filter(unit => isCJK(unit.ch) && unit.py).length;
    if (chineseUnitCount && filledChineseCount !== chineseUnitCount) {
      warns.push(`${label}：有部分汉字暂时未能自动生成拼音，可直接点击上方拼音进行修改。`);
    }

    blocks.push({ units, isEmpty: false, sourceLine: zhLine, lineIndex: idx });
  });

  return { blocks, warns };
}

/* ════════════════════════════════════════════════
   RENDERER
════════════════════════════════════════════════ */
function renderBlocks(blocks) {
  const area = document.getElementById("readingPreview");
  if (!area) return; // Bug #10 fix: 防止元素不存在时直接操作 innerHTML 报错
  area.innerHTML = "";

  if (!blocks.length) {
    area.innerHTML =
      `<div class="empty"><div class="ico">🤔</div>
       <p>没有可渲染的内容，请检查输入格式。</p></div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  blocks.forEach((block, blockIndex) => {
    const paraDiv = document.createElement("div");
    paraDiv.className = "para-block";
    paraDiv.dataset.blockIndex = String(blockIndex);
    paraDiv.dataset.lineIndex = block.lineIndex != null ? String(block.lineIndex) : "";
    paraDiv.dataset.sourceLine = block.sourceLine || "";

    if (block.isEmpty) {
      frag.appendChild(paraDiv);
      return;
    }

    /* ── Chinese + Pinyin line ── */
    const zhLine = document.createElement("div");
    zhLine.className = "zh-line";

    const renderedUnits = [];

    for (const [unitIndex, unit] of block.units.entries()) {
      const wu = document.createElement("span");
      wu.className = "wu" + (unit.isPunct ? " wu-p" : "");
      if (!unit.isPunct) wu.onclick = function() { toggleWord(this); };

      /* Pinyin slot — always present to maintain row height */
      const py = document.createElement("span");
      py.className = "py" + (unit.isPunct ? " py-p" : "");
      py.dataset.blockIndex = String(blockIndex);
      py.dataset.unitIndex = String(unitIndex);
      /* non-breaking space gives punctuation slots the same height */
      py.textContent = unit.isPunct ? "\u00A0" : (unit.py || "\u00A0");
      py.dataset.lastValue = py.textContent; // Bug #8 fix: 在创建时初始化 lastValue，防止 Escape 键处理器访问未定义值
      if (!unit.isPunct) {
        py.title = "点击这里直接修改拼音";
        py.addEventListener("click", function(event) {
          event.stopPropagation();
          startInlinePinyinEdit(this);
        });
        py.addEventListener("input", function() {
          setPinyinValue(this.dataset.blockIndex, this.dataset.unitIndex, this.textContent || "", {
            keepVisible: true,
            skipDisplay: true
          });
        });
        py.addEventListener("blur", function() {
          finishInlinePinyinEdit(this);
        });
        py.addEventListener("keydown", function(event) {
          if (event.key === "Enter") {
            event.preventDefault();
            this.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            this.textContent = this.dataset.lastValue || "\u00A0";
            this.blur();
          }
        });
      }

      /* Character */
      const ch = document.createElement("span");
      ch.className = "ch";
      ch.textContent = unit.ch;

      if (!unit.isPunct && !unit.py) {
        wu.classList.add("wu-no-py");
        py.classList.add("py-empty");
      }

      wu.appendChild(py);
      wu.appendChild(ch);
      renderedUnits.push({ unit, wu });
    }

    const unitGroups = buildWrappedUnitGroups(renderedUnits);
    for (const group of unitGroups) {
      zhLine.appendChild(group);
    }
    paraDiv.appendChild(zhLine);

    frag.appendChild(paraDiv);
  });

  area.appendChild(frag);
}

function buildWrappedUnitGroups(renderedUnits) {
  const groups = [];
  let lastGroup = null;

  const createGroup = (kind) => {
    const group = document.createElement("span");
    group.className = "unit-group";
    group.dataset.kind = kind;
    groups.push(group);
    lastGroup = group;
    return group;
  };

  for (const item of renderedUnits) {
    const { unit, wu } = item;
    if (unit.isPunct) {
      (lastGroup || createGroup("punct")).appendChild(wu);
      continue;
    }

    if (isDigitString(unit.ch) && lastGroup && lastGroup.dataset.kind === "digit") {
      lastGroup.appendChild(wu);
      continue;
    }

    createGroup(isDigitString(unit.ch) ? "digit" : "char").appendChild(wu);
  }

  return groups;
}

function generatePinyinForChars(chars, options = {}) {
  const { silent = false } = options;
  const hasPinyinLib = hasPinyinLibAvailable();

  if (!hasPinyinLib) {
    const fallback = chars.map(() => "");
    const hasMissing = chars.some((ch, idx) => !fallback[idx] && isCJK(ch));
    if (hasMissing) {
      if (!silent) {
        const errEl = document.getElementById("errMsg");
        errEl.textContent = "❌ 自动拼音功能当前不可用。请确认浏览器可以联网加载拼音库，或手动输入拼音。";
        errEl.classList.add("show");
        refreshInputBodyHeight();
      }
      return null;
    }
    return fallback;
  }

  return chars.map(ch => {
    if (!isCJK(ch)) return "";

    const one = window.pinyinPro.pinyin(ch, {
      toneType: "symbol",
      type: "array",
      nonZh: "removed"
    });
    return Array.isArray(one) && one[0] ? one[0] : "";
  });
}

function resetReadingMessages() {
  const warnEl = document.getElementById("warnMsg");
  const errEl  = document.getElementById("errMsg");
  if (!warnEl || !errEl) return;
  warnEl.classList.remove("show");
  errEl.classList.remove("show");
  warnEl.innerHTML = "";
  errEl.textContent = "";
}

function renderEmptyPreview(message) {
  const area = document.getElementById("readingPreview");
  if (!area) return;
  area.innerHTML =
    `<div class="empty"><div class="ico">阅读视图</div><p>${message}</p></div>`;
}

/* ════════════════════════════════════════════════
   GENERATE  (called by button)
════════════════════════════════════════════════ */
function generate(options = {}) {
  const {
    scrollIntoView = true,
    quietEmpty = false,
    resetInteractiveState = true
  } = options;
  const input = document.getElementById("customInput");
  const raw = input ? input.value : "";
  const warnEl = document.getElementById("warnMsg");
  const errEl  = document.getElementById("errMsg");
  resetReadingMessages();

  if (!raw.trim()) {
    if (!quietEmpty && errEl) {
      errEl.textContent = "⚠️ 请先在上方阅读框中输入内容。";
      errEl.classList.add("show");
    }
    renderEmptyPreview("请点击“编辑内容 Edit Content”输入汉字。");
    return;
  }

  if ([...raw].some(isCJK) && !hasPinyinLibAvailable()) {
    if (errEl) {
      errEl.textContent = "❌ 自动拼音功能当前不可用。请确认浏览器可以联网加载拼音库，或手动输入拼音。";
      errEl.classList.add("show");
    }
  }

  const { blocks, warns } = parseText(raw);

  if (warns.length && warnEl) {
    // Bug #9 fix: 改用安全的 DOM 方法渲染警告信息，避免 innerHTML 注入风险
    warnEl.innerHTML = "";
    warns.forEach((w, i) => {
      if (i > 0) warnEl.appendChild(document.createElement("br"));
      warnEl.appendChild(document.createTextNode("⚠️ " + w));
    });
    warnEl.classList.add("show");
  }

  if (!blocks.length) {
    if (errEl) {
      errEl.textContent =
        "❌ 解析失败：未找到有效内容段落。请确认每一行都输入中文内容。";
      errEl.classList.add("show");
    }
    renderEmptyPreview("没有可渲染的内容，请检查上方输入。");
    return;
  }

  renderBlocks(blocks);

  /* Reset or preserve interactive state */
  if (resetInteractiveState) {
    pyVisible = false;
    manualPinyinOverrides.clear(); // Bug #14 fix: 每次重新生成时清除旧的拼音覆盖，防止已删除内容的拼音数据残留
  }
  if (pyVisible) {
    showAll();
  } else {
    hideAll();
  }
  syncPinyinButton();
  syncHighlightButton();

  /* Scroll reading card into view */
  if (scrollIntoView) {
    document.getElementById("readingCard")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }
  requestAnimationFrame(() => {
    updateSideMenuScrollPosition();
  });
}

/* ════════════════════════════════════════════════
   SAMPLE TEXT
════════════════════════════════════════════════ */
const SAMPLE = `\
你好！欢迎使用汉语阅读助手。`;

function loadSample(options = {}) {
  const input = document.getElementById("customInput");
  if (!input) return;
  input.value = SAMPLE;
  generate(options);
}

/* ════════════════════════════════════════════════
   BUILT-IN LESSONS
════════════════════════════════════════════════ */
function getBuiltInLessons() {
  return Array.isArray(window.CHINESE_READER_LESSONS)
    ? window.CHINESE_READER_LESSONS
    : [];
}

function initLessonSelector() {
  const select = document.getElementById("lessonSelect");
  const optionsEl = document.getElementById("lessonOptions");
  if (!select) return;

  const lessons = getBuiltInLessons();
  lessons.forEach((lesson) => {
    const option = document.createElement("option");
    option.value = lesson.id;
    option.textContent = lesson.title;
    select.appendChild(option);

    if (optionsEl) {
      const optionButton = document.createElement("button");
      optionButton.className = "lesson-option";
      optionButton.type = "button";
      optionButton.role = "option";
      optionButton.dataset.lessonId = lesson.id;
      optionButton.textContent = lesson.title;
      optionButton.addEventListener("click", () => {
        select.value = lesson.id;
        updateSelectedLessonDescription();
        setLessonDropdownOpen(false);
      });
      optionsEl.appendChild(optionButton);
    }
  });

  select.addEventListener("change", updateSelectedLessonDescription);
  document.addEventListener("click", closeLessonDropdownOnOutsideClick);
  document.addEventListener("keydown", handleLessonDropdownKeydown);
  updateSelectedLessonDescription();
}

function updateSelectedLessonDescription() {
  const select = document.getElementById("lessonSelect");
  const trigger = document.getElementById("lessonSelectTrigger");
  const options = document.querySelectorAll(".lesson-option");
  const lessonMsg = document.getElementById("lessonMsg");
  if (!select) return;
  const isPlaceholder = !select.value;
  const selectedLesson = getBuiltInLessons().find(item => item.id === select.value);
  if (trigger) {
    trigger.textContent = selectedLesson ? selectedLesson.title : "请选择课文 Please select a text";
    trigger.classList.toggle("is-placeholder", isPlaceholder);
  }
  options.forEach((option) => {
    const isSelected = option.dataset.lessonId === select.value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-selected", String(isSelected));
  });

  if (lessonMsg) {
    lessonMsg.classList.remove("show");
    lessonMsg.textContent = "";
  }
}

function toggleLessonDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById("lessonDropdown");
  setLessonDropdownOpen(!(dropdown && dropdown.classList.contains("is-open")));
}

function setLessonDropdownOpen(open) {
  const dropdown = document.getElementById("lessonDropdown");
  const trigger = document.getElementById("lessonSelectTrigger");
  if (!dropdown || !trigger) return;
  dropdown.classList.toggle("is-open", open);
  trigger.setAttribute("aria-expanded", String(open));
}

function closeLessonDropdownOnOutsideClick(event) {
  const dropdown = document.getElementById("lessonDropdown");
  if (!dropdown || dropdown.contains(event.target)) return;
  setLessonDropdownOpen(false);
}

function handleLessonDropdownKeydown(event) {
  if (event.key !== "Escape") return;
  setLessonDropdownOpen(false);
}

function loadSelectedLesson() {
  const select = document.getElementById("lessonSelect");
  const input = document.getElementById("customInput");
  const lessonMsg = document.getElementById("lessonMsg");
  if (!select || !input) return;

  const lesson = getBuiltInLessons().find(item => item.id === select.value);
  if (!lesson) {
    if (lessonMsg) {
      lessonMsg.textContent = "请先选择一篇课文。Please select a text.";
      lessonMsg.classList.add("show");
    }
    return;
  }

  setReadingSourceText(lesson.text || "");
  generate({ scrollIntoView: false });
  updateSelectedLessonDescription();
  slowScrollToElement(document.querySelector(".reading-shell"), LESSON_READER_SCROLL_DURATION);
}
