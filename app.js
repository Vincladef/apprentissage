import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const REQUIRED_FIREBASE_CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId"
];

function getFirebaseConfigError(config) {
  if (!config || typeof config !== "object") {
    return "Aucune configuration Firebase n'a été fournie. Copiez les identifiants Web de votre projet dans firebase-config.js.";
  }

  const placeholderPattern = /^__REPLACE_WITH_YOUR_FIREBASE_/;
  const missingKey = REQUIRED_FIREBASE_CONFIG_KEYS.find((key) => {
    const value = config[key];
    return typeof value !== "string" || value.trim() === "" || placeholderPattern.test(value);
  });

  if (missingKey) {
    return `La propriété \`${missingKey}\` doit être renseignée dans firebase-config.js avec les valeurs de votre projet.`;
  }

  return null;
}

function renderFirebaseConfigError(message) {
  const loginScreen = document.getElementById("login-screen");
  if (!loginScreen) {
    console.error(message);
    return;
  }

  loginScreen.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card error";

  const title = document.createElement("h2");
  title.textContent = "Configuration Firebase requise";
  card.appendChild(title);

  const mainMessage = document.createElement("p");
  mainMessage.textContent = message;
  card.appendChild(mainMessage);

  const instructions = document.createElement("p");
  instructions.textContent =
    "Ouvrez le fichier firebase-config.js et remplacez les valeurs par celles fournies dans la console Firebase (Paramètres du projet > Vos applications).";
  card.appendChild(instructions);

  loginScreen.appendChild(card);
}

const firebaseConfigError = getFirebaseConfigError(firebaseConfig);
if (firebaseConfigError) {
  renderFirebaseConfigError(firebaseConfigError);
  console.error(firebaseConfigError);
} else {
  bootstrapApp();
}

function bootstrapApp() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  const AUTH_EMAIL_DOMAIN = "pseudo.apprentissage";
  const AUTH_PASSWORD_SUFFIX = "#appr";
  const MIN_PSEUDO_LENGTH = 3;
  const SAVE_DEBOUNCE_MS = 700;
  const HIGHLIGHT_COLOR = "#fde68a";
  const DEFAULT_TEXT_COLOR = "#1f2937";
  const DEFAULT_FONT_FAMILY = "Arial";
  const FONT_SIZE_STEPS = [10, 11, 12, 14, 18, 24, 32];
  const DEFAULT_FONT_SIZE_INDEX = 1;
  const IMAGE_RESIZE_MIN_WIDTH = 80;
  const IMAGE_RESIZE_KEYBOARD_STEP = 10;
  const IMAGE_RESIZE_KEYBOARD_STEP_LARGE = 40;
  const CLOZE_PLACEHOLDER_TEXT = "[ … ]";
  const CLOZE_FEEDBACK_RULES = {
    yes: {
      delta: 1,
      label: "✅ Oui (réponse facile)",
      toastType: "success"
    },
    "rather-yes": {
      delta: 0.5,
      label: "🙂 Plutôt oui (réponse trouvée mais hésitante)",
      toastType: "success"
    },
    neutral: {
      reset: true,
      label: "😐 Neutre",
      toastType: "info"
    },
    "rather-no": {
      reset: true,
      label: "🤔 Plutôt non (erreur partielle)",
      toastType: "warning"
    },
    no: {
      reset: true,
      label: "❌ Non (réponse incorrecte ou oubliée)",
      toastType: "error"
    }
  };
  const CLOZE_FEEDBACK_STATUS_DATASET_KEY = "feedbackStatus";
  const CLOZE_FEEDBACK_STATUS_CLASSES = {
    yes: "cloze-status-positive",
    "rather-yes": "cloze-status-positive",
    neutral: "cloze-status-neutral",
    "rather-no": "cloze-status-negative",
    no: "cloze-status-negative"
  };
  const CLOZE_STATUS_CLASS_VALUES = [
    "cloze-status-positive",
    "cloze-status-neutral",
    "cloze-status-negative"
  ];
  const CLOZE_DEFER_DATA_KEY = "deferMask";
  const CLOZE_MANUAL_REVEAL_SET_KEY = "revealedClozes";
  const CLOZE_MANUAL_REVEAL_DATASET_KEY = "manualReveal";
  const CLOZE_MANUAL_REVEAL_ATTR = "data-manual-reveal";



  const relativeTime = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  const state = {
    pseudo: null,
    displayName: null,
    pendingDisplayName: null,
    pendingVisibility: null,
    notesUnsubscribe: null,
    notes: [],
    notesById: new Map(),
    collapsedNoteIds: new Set(),
    currentNoteId: null,
    currentNote: null,
    pendingSelectionId: null,
    pendingSave: null,
    hasUnsavedChanges: false,
    lastSavedAt: null,
    fontSizeIndex: DEFAULT_FONT_SIZE_INDEX,
    activeCloze: null,
    pendingRemoteNote: null,
    isEditorFocused: false,
    isRevisionMode: false,
    savedSelection: null,
    [CLOZE_MANUAL_REVEAL_SET_KEY]: new WeakSet(),
    visibility: null,
    publicUsers: [],
    publicUsersUnsubscribe: null,
  };

  const imageResizeState = {
    pointerId: null,
    wrapper: null,
    img: null,
    handle: null,
    startX: 0,
    startWidth: 0,
    editorWidth: 0,
    hasChanges: false,
    savedSelection: null,
  };
  let isImageResizeActive = false;

  function getManualRevealSet() {
    if (!state[CLOZE_MANUAL_REVEAL_SET_KEY]) {
      state[CLOZE_MANUAL_REVEAL_SET_KEY] = new WeakSet();
    }
    return state[CLOZE_MANUAL_REVEAL_SET_KEY];
  }

  const views = {
    login: document.getElementById("login-screen"),
    workspace: document.getElementById("workspace")
  };

  const ui = {
    loginForm: document.getElementById("login-form"),
    pseudoInput: document.getElementById("pseudo"),
    loginButton: document.querySelector("#login-form button[type='submit']"),
    publicAccountsSection: document.getElementById("public-accounts"),
    publicUsersList: document.getElementById("public-users-list"),
    publicUsersEmpty: document.getElementById("public-users-empty"),
    currentUser: document.getElementById("current-user"),
    logoutBtn: document.getElementById("logout-btn"),
    headerMenuBtn: document.getElementById("workspace-menu-btn"),
    headerMenu: document.getElementById("workspace-menu"),
    addNoteBtn: document.getElementById("add-note-btn"),
    notesContainer: document.getElementById("notes-container"),
    noteTitle: document.getElementById("note-title"),
    noteEditor: document.getElementById("note-editor"),
    saveStatus: document.getElementById("save-status"),
    editorWrapper: document.getElementById("editor-wrapper"),
    emptyState: document.getElementById("empty-note"),
    toast: document.getElementById("toast"),
    toolbar: document.querySelector(".editor-toolbar"),
    blockFormat: document.getElementById("block-format"),
    fontFamily: document.getElementById("font-family"),
    fontSizeValue: document.getElementById("font-size-value"),
    clozeFeedback: document.getElementById("cloze-feedback"),
    workspaceOverlay: document.getElementById("drawer-overlay"),
    mobileNotesBtn: document.getElementById("mobile-notes-btn"),
    toolbarMoreBtn: document.getElementById("toolbar-more-btn"),
    toolbarMorePanel: document.getElementById("toolbar-more-panel"),
    toolbarFormattingControls: document.getElementById("toolbar-formatting-controls"),
    desktopFormattingSlot: document.querySelector("[data-desktop-formatting-slot]"),
    revisionModeToggle: document.getElementById("revision-mode-toggle"),
    revisionIterationBtn: document.getElementById("revision-iteration-btn"),
  };

  ui.visibilityInputs = ui.loginForm
    ? Array.from(ui.loginForm.querySelectorAll("input[name='visibility']"))
    : [];
  ui.visibilityField = ui.loginForm?.elements?.namedItem("visibility") ?? null;
  if (ui.publicUsersList) {
    ui.publicUsersList.setAttribute("aria-live", "polite");
  }
  const defaultPublicUsersEmptyMessage = ui.publicUsersEmpty?.textContent?.trim()
    ? ui.publicUsersEmpty.textContent
    : "Aucun compte public pour le moment.";

  const workspaceLayout = document.querySelector(".workspace");
  const bodyElement = document.body;
  const rootElement = document.documentElement;
  const headerElement = document.querySelector(".app-header");
  const visualViewport = window.visualViewport ?? null;
  const mobileMediaQuery = window.matchMedia("(max-width: 900px)");
  const toolbarFormattingHome = {
    parent: ui.toolbarMorePanel ?? null,
    before:
      ui.toolbarMorePanel?.querySelector(".toolbar-group--advanced") ?? null
  };

  const KEYBOARD_VISIBLE_CLASS = "keyboard-visible";
  const KEYBOARD_HEIGHT_THRESHOLD = 120;
  let viewportKeyboardVisible = false;
  let baselineViewportHeight = visualViewport?.height ?? window.innerHeight;

  function updateKeyboardVisibility() {
    if (!bodyElement) {
      return;
    }
    const shouldShow = Boolean(state.isEditorFocused || viewportKeyboardVisible);
    bodyElement.classList.toggle(KEYBOARD_VISIBLE_CLASS, shouldShow);
  }

  function resetViewportBaseline() {
    baselineViewportHeight = visualViewport?.height ?? window.innerHeight;
  }

  function handleVisualViewportChange() {
    if (!visualViewport) {
      return;
    }

    const currentHeight = visualViewport.height;
    if (typeof currentHeight !== "number") {
      return;
    }

    if (!viewportKeyboardVisible && currentHeight > baselineViewportHeight) {
      baselineViewportHeight = currentHeight;
    }

    const delta = baselineViewportHeight - currentHeight;
    const isVisible = delta > KEYBOARD_HEIGHT_THRESHOLD;

    if (isVisible !== viewportKeyboardVisible) {
      viewportKeyboardVisible = isVisible;
      updateKeyboardVisibility();
    }

    if (!isVisible && !state.isEditorFocused) {
      resetViewportBaseline();
    }
  }

  if (visualViewport) {
    visualViewport.addEventListener("resize", handleVisualViewportChange);
    visualViewport.addEventListener("scroll", handleVisualViewportChange);
  }

  let lastHeaderHeight = 0;

  function updateToolbarOffsets() {
    if (!rootElement || !headerElement) {
      return;
    }
    const headerRect = headerElement.getBoundingClientRect();
    const height = Math.round(headerRect.height);
    if (!height && lastHeaderHeight === 0) {
      return;
    }
    if (height === lastHeaderHeight) {
      return;
    }
    lastHeaderHeight = height;
    rootElement.style.setProperty("--header-height", `${height}px`);
  }

  updateToolbarOffsets();

  let headerResizeObserver;
  if (typeof ResizeObserver === "function" && headerElement) {
    headerResizeObserver = new ResizeObserver(() => updateToolbarOffsets());
    headerResizeObserver.observe(headerElement);
  } else {
    window.addEventListener("resize", updateToolbarOffsets, { passive: true });
  }
  window.addEventListener("orientationchange", () => {
    updateToolbarOffsets();
    resetViewportBaseline();
    viewportKeyboardVisible = false;
    updateKeyboardVisibility();
  }, { passive: true });

  function keepHeaderVisible() {
    if (!bodyElement) {
      return;
    }

    bodyElement.classList.remove("header-collapsed");
  }

  function setRevisionMode(enabled) {
    const hasNote = Boolean(state.currentNote);
    const shouldEnable = Boolean(enabled && hasNote);
    if (enabled && !hasNote) {
      showToast("Ouvrez une fiche pour activer le mode révision.", "info");
    }
    state.isRevisionMode = shouldEnable;

    if (bodyElement) {
      bodyElement.classList.toggle("revision-mode", shouldEnable);
    }

    if (ui.revisionModeToggle) {
      ui.revisionModeToggle.setAttribute("aria-pressed", String(shouldEnable));
      ui.revisionModeToggle.setAttribute(
        "aria-label",
        shouldEnable ? "Désactiver le mode révision" : "Activer le mode révision"
      );
      ui.revisionModeToggle.disabled = !hasNote;
    }

    if (ui.revisionIterationBtn) {
      ui.revisionIterationBtn.disabled = !shouldEnable;
    }

    if (headerElement) {
      headerElement.classList.toggle("toolbar-hidden", shouldEnable || !hasNote);
    }

    if (shouldEnable) {
      closeHeaderMenu();
      setNotesDrawer(false);
      setSidebarCollapsed(false);
      hideClozeFeedback();
    }

    if (ui.noteEditor) {
      const isEditable = hasNote && !shouldEnable;
      ui.noteEditor.setAttribute("contenteditable", isEditable ? "true" : "false");
      if (!isEditable) {
        ui.noteEditor.setAttribute("aria-disabled", "true");
        ui.noteEditor.blur();
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
        state.savedSelection = null;
      } else {
        ui.noteEditor.removeAttribute("aria-disabled");
      }
    }

    if (ui.noteTitle) {
      ui.noteTitle.readOnly = shouldEnable || !hasNote;
      if (shouldEnable) {
        ui.noteTitle.blur();
      }
    }

    if (shouldEnable) {
      state.isEditorFocused = false;
    }

    setToolbarMoreMenu(false);
    updateKeyboardVisibility();
    updateToolbarOffsets();
    return state.isRevisionMode;
  }

  function handleEditorFocus() {
    state.isEditorFocused = true;
    if (visualViewport) {
      baselineViewportHeight = Math.max(
        baselineViewportHeight,
        visualViewport.height ?? baselineViewportHeight
      );
    }
    rememberEditorSelection();
    updateKeyboardVisibility();
  }

  function handleEditorBlur() {
    state.isEditorFocused = false;
    if (!viewportKeyboardVisible) {
      resetViewportBaseline();
    }
    updateKeyboardVisibility();
    if (!state.hasUnsavedChanges) {
      applyPendingRemoteNote();
    } else {
      state.pendingRemoteNote = null;
    }
  }

  window.addEventListener("scroll", keepHeaderVisible, { passive: true });
  keepHeaderVisible();

  setRevisionMode(false);


  showView(null);
  ui.logoutBtn.disabled = true;
  updateFontSizeDisplay();
  if (ui.fontFamily) {
    ui.fontFamily.value = DEFAULT_FONT_FAMILY;
  }
  if (ui.blockFormat) {
    ui.blockFormat.value = "p";
  }

  setupLayoutControls();
  handleResponsiveState(mobileMediaQuery);
  if (typeof mobileMediaQuery.addEventListener === "function") {
    mobileMediaQuery.addEventListener("change", handleResponsiveState);
  } else if (typeof mobileMediaQuery.addListener === "function") {
    mobileMediaQuery.addListener(handleResponsiveState);
  }

  function closestElement(target, selector) {
    if (!target || typeof target.closest !== "function") {
      return null;
    }
    return target.closest(selector);
  }

  function setNotesButtonLabel(label) {
    if (!ui.mobileNotesBtn) return;
    ui.mobileNotesBtn.setAttribute("aria-label", label);
    const srText = ui.mobileNotesBtn.querySelector(".sr-only");
    if (srText) {
      srText.textContent = label;
    }
  }

  function updateNotesButtonForSidebar(isExpanded) {
    if (!ui.mobileNotesBtn) return;
    ui.mobileNotesBtn.dataset.mode = "sidebar";
    ui.mobileNotesBtn.setAttribute("aria-pressed", String(isExpanded));
    ui.mobileNotesBtn.setAttribute("aria-expanded", String(isExpanded));
    setNotesButtonLabel(
      isExpanded ? "Masquer la liste des fiches" : "Afficher la liste des fiches"
    );
  }

  function updateNotesButtonForDrawer(isOpen) {
    if (!ui.mobileNotesBtn) return;
    ui.mobileNotesBtn.dataset.mode = "drawer";
    ui.mobileNotesBtn.setAttribute("aria-pressed", String(isOpen));
    ui.mobileNotesBtn.removeAttribute("aria-expanded");
    setNotesButtonLabel(isOpen ? "Masquer les fiches" : "Afficher les fiches");
  }

  function showView(name) {
    Object.entries(views).forEach(([key, section]) => {
      if (!section) return;
      section.classList.toggle("active", key === name);
      section.classList.toggle("hidden", key !== name);
    });
  }

  function showToast(message, type = "info") {
    if (!ui.toast) return;
    ui.toast.textContent = message;
    ui.toast.dataset.type = type;
    ui.toast.classList.remove("hidden");
    setTimeout(() => {
      ui.toast.classList.add("hidden");
    }, 2600);
  }

  function setupLayoutControls() {
    setSidebarCollapsed(false);

    if (ui.headerMenuBtn && ui.headerMenu) {
      ui.headerMenuBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = ui.headerMenu.classList.contains("open");
        toggleHeaderMenu(!isOpen);
      });
    }

    if (ui.mobileNotesBtn) {
      ui.mobileNotesBtn.addEventListener("click", () => {
        if (mobileMediaQuery.matches) {
          const shouldOpen = !document.body.classList.contains("notes-drawer-open");
          setNotesDrawer(shouldOpen);
        } else {
          const isCollapsed = workspaceLayout?.classList.contains("sidebar-collapsed");
          setSidebarCollapsed(!isCollapsed);
        }
      });
    }

    if (ui.workspaceOverlay) {
      ui.workspaceOverlay.addEventListener("click", () => setNotesDrawer(false));
    }

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (document.body.classList.contains("notes-drawer-open")) {
        setNotesDrawer(false);
        return;
      }
      if (ui.toolbarMorePanel && ui.toolbarMorePanel.classList.contains("is-open")) {
        setToolbarMoreMenu(false);
        return;
      }
      if (ui.headerMenu && ui.headerMenu.classList.contains("open")) {
        closeHeaderMenu();
      }
    });
  }

  function handleResponsiveState(event) {
    const isMobile = event?.matches ?? mobileMediaQuery.matches;

    if (!isMobile) {
      setNotesDrawer(false);
      setSidebarCollapsed(false);
      updateNotesButtonForSidebar(true);
      closeHeaderMenu();
      setToolbarMoreMenu(false);
    } else {
      setNotesDrawer(false);
      updateNotesButtonForDrawer(false);
    }
  }

  function setSidebarCollapsed(collapsed) {
    if (!workspaceLayout) return;
    const shouldCollapse = Boolean(collapsed);
    workspaceLayout.classList.toggle("sidebar-collapsed", shouldCollapse);

    if (ui.mobileNotesBtn && !mobileMediaQuery.matches) {
      updateNotesButtonForSidebar(!shouldCollapse);
    }

  }

  function setNotesDrawer(open) {
    const shouldOpen = Boolean(open);
    document.body.classList.toggle("notes-drawer-open", shouldOpen);
    if (ui.mobileNotesBtn && mobileMediaQuery.matches) {
      updateNotesButtonForDrawer(shouldOpen);
    }
    if (ui.workspaceOverlay) {
      if (shouldOpen) {
        ui.workspaceOverlay.removeAttribute("hidden");
      } else if (!ui.workspaceOverlay.hasAttribute("hidden")) {
        ui.workspaceOverlay.setAttribute("hidden", "");
      }
    }
    if (shouldOpen) {
      closeHeaderMenu();
    }
  }

  function toggleHeaderMenu(forceOpen) {
    if (!ui.headerMenuBtn || !ui.headerMenu) return;
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !ui.headerMenu.classList.contains("open");
    if (shouldOpen) {
      ui.headerMenu.classList.add("open");
      ui.headerMenuBtn.setAttribute("aria-expanded", "true");
      document.addEventListener("click", closeMenuOnOutsideClick);
    } else {
      closeHeaderMenu();
    }
  }

  function closeHeaderMenu() {
    if (!ui.headerMenuBtn || !ui.headerMenu) return;
    ui.headerMenu.classList.remove("open");
    ui.headerMenuBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", closeMenuOnOutsideClick);
  }

  function closeMenuOnOutsideClick(event) {
    if (!ui.headerMenuBtn || !ui.headerMenu) return;
    if (
      ui.headerMenu.contains(event.target) ||
      ui.headerMenuBtn.contains(event.target)
    ) {
      return;
    }
    closeHeaderMenu();
  }

  function toggleToolbarMoreMenu(forceOpen) {
    if (!ui.toolbarMorePanel) return;
    const isOpen = ui.toolbarMorePanel.classList.contains("is-open");
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpen;
    setToolbarMoreMenu(shouldOpen);
  }

  function setToolbarMoreMenu(open) {
    if (!ui.toolbarMoreBtn || !ui.toolbarMorePanel) return;
    if (!mobileMediaQuery.matches) {
      ui.toolbarMorePanel.classList.remove("is-open");
      ui.toolbarMorePanel.setAttribute("aria-hidden", "true");
      ui.toolbarMoreBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", handleToolbarOutsideClick);
      return;
    }
    const shouldOpen = Boolean(open);
    const isOpen = ui.toolbarMorePanel.classList.contains("is-open");

    if (shouldOpen) {
      if (!isOpen) {
        ui.toolbarMorePanel.classList.add("is-open");
      }
      ui.toolbarMorePanel.removeAttribute("aria-hidden");
      ui.toolbarMoreBtn.setAttribute("aria-expanded", "true");
      document.addEventListener("click", handleToolbarOutsideClick);
    } else {
      if (isOpen) {
        ui.toolbarMorePanel.classList.remove("is-open");
      }
      ui.toolbarMorePanel.setAttribute("aria-hidden", "true");
      ui.toolbarMoreBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", handleToolbarOutsideClick);
    }
  }

  function handleToolbarOutsideClick(event) {
    if (!ui.toolbarMoreBtn || !ui.toolbarMorePanel) return;
    if (
      ui.toolbarMorePanel.contains(event.target) ||
      ui.toolbarMoreBtn.contains(event.target)
    ) {
      return;
    }
    setToolbarMoreMenu(false);
  }

  function updateToolbarFormattingLayout() {
    if (!ui.toolbarFormattingControls) {
      return;
    }

    const isMobileLayout = mobileMediaQuery.matches;

    if (!isMobileLayout) {
      if (
        ui.desktopFormattingSlot &&
        !ui.desktopFormattingSlot.contains(ui.toolbarFormattingControls)
      ) {
        ui.desktopFormattingSlot.appendChild(ui.toolbarFormattingControls);
      }
      if (ui.toolbarMoreBtn) {
        ui.toolbarMoreBtn.setAttribute("hidden", "");
        ui.toolbarMoreBtn.setAttribute("aria-hidden", "true");
        ui.toolbarMoreBtn.setAttribute("aria-expanded", "false");
      }
      setToolbarMoreMenu(false);
      if (ui.toolbarMorePanel) {
        ui.toolbarMorePanel.setAttribute("aria-hidden", "true");
      }
      return;
    }

    if (
      toolbarFormattingHome.parent &&
      toolbarFormattingHome.parent !== ui.toolbarFormattingControls.parentElement
    ) {
      const referenceNode =
        toolbarFormattingHome.before &&
        toolbarFormattingHome.before.parentNode === toolbarFormattingHome.parent
          ? toolbarFormattingHome.before
          : null;
      toolbarFormattingHome.parent.insertBefore(
        ui.toolbarFormattingControls,
        referenceNode
      );
    }
    if (ui.toolbarMoreBtn) {
      ui.toolbarMoreBtn.removeAttribute("hidden");
      ui.toolbarMoreBtn.removeAttribute("aria-hidden");
      ui.toolbarMoreBtn.setAttribute("aria-expanded", "false");
    }
    if (ui.toolbarMorePanel) {
      ui.toolbarMorePanel.classList.remove("is-open");
      ui.toolbarMorePanel.setAttribute("aria-hidden", "true");
    }
  }

  function isPermissionDenied(error) {
    if (!error) return false;
    if (error.code === "permission-denied") return true;
    const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
    return message.includes("missing or insufficient permissions");
  }

  function reportPermissionIssue(context) {
    const hint =
      "Règles Firestore insuffisantes. Déployez le fichier firestore.rules dans votre projet et vérifiez AUTH_EMAIL_DOMAIN.";
    const fullMessage = context ? `${context} : ${hint}` : hint;
    console.error(fullMessage);
    showToast("Permissions Firestore insuffisantes. Consultez la console pour les étapes.", "error");
  }

  function normalizePseudoInput(rawPseudo = "") {
    const trimmed = (rawPseudo || "").trim();
    if (!trimmed) {
      return { pseudoKey: "", displayName: "" };
    }
    const ascii = trimmed
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const lower = ascii.toLowerCase();
    const safe = lower
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "");
    return { pseudoKey: safe, displayName: trimmed };
  }

  function sanitizeVisibility(rawVisibility) {
    return rawVisibility === "public" ? "public" : "private";
  }

  function buildAuthEmail(pseudoKey) {
    return `${pseudoKey}@${AUTH_EMAIL_DOMAIN}`;
  }

  function buildAuthPassword(pseudoKey) {
    return `${pseudoKey}${AUTH_PASSWORD_SUFFIX}`;
  }

  function extractPseudoFromEmail(email = "") {
    const suffix = `@${AUTH_EMAIL_DOMAIN}`;
    if (!email || !email.endsWith(suffix)) {
      return null;
    }
    return email.slice(0, -suffix.length);
  }

  function sanitizeHtml(html = "") {
    const container = document.createElement("div");
    container.innerHTML = html;
    container.querySelectorAll("script, style").forEach((el) => el.remove());
    container.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name === CLOZE_MANUAL_REVEAL_ATTR) {
          el.setAttribute(CLOZE_MANUAL_REVEAL_ATTR, "1");
          return;
        }
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      });
      if (el.classList && el.classList.contains("cloze-revealed")) {
        el.classList.remove("cloze-revealed");
      }
    });
    container
      .querySelectorAll(".editor-image__handle")
      .forEach((handle) => handle.remove());
    container.querySelectorAll(".editor-image").forEach((wrapper) => {
      unwrapEditorImage(wrapper);
    });
    return container.innerHTML;
  }

  function formatRelativeDate(date) {
    if (!(date instanceof Date)) {
      return "Jamais enregistré";
    }
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const minutes = Math.round(absMs / 60000);
    if (minutes < 1) {
      return "À l'instant";
    }
    if (minutes < 60) {
      const value = diffMs < 0 ? -minutes : minutes;
      return relativeTime.format(value, "minute");
    }
    const hours = Math.round(absMs / 3600000);
    if (hours < 24) {
      const value = diffMs < 0 ? -hours : hours;
      return relativeTime.format(value, "hour");
    }
    const days = Math.round(absMs / 86400000);
    const value = diffMs < 0 ? -days : days;
    return relativeTime.format(value, "day");
  }

  function updateSaveStatus(stateValue, date = null) {
    if (!ui.saveStatus) return;
    ui.saveStatus.dataset.state = stateValue || "";
    switch (stateValue) {
      case "dirty":
        ui.saveStatus.textContent = "Modifications non enregistrées";
        break;
      case "saving":
        ui.saveStatus.textContent = "Enregistrement...";
        break;
      case "saved":
        ui.saveStatus.textContent = date ? `Enregistré le ${dateFormatter.format(date)}` : "Enregistré";
        break;
      case "error":
        ui.saveStatus.textContent = "Erreur d'enregistrement";
        break;
      default:
        ui.saveStatus.textContent = "";
        break;
    }
  }

  function getEditorContentWidth() {
    if (!ui.noteEditor) {
      return 0;
    }
    const rect = ui.noteEditor.getBoundingClientRect();
    return rect && typeof rect.width === "number" ? rect.width : 0;
  }

  function applyImageWidth(wrapper, img, widthPx) {
    if (!wrapper || !img) return;
    const editorWidth = getEditorContentWidth();
    const minWidth = IMAGE_RESIZE_MIN_WIDTH;
    let resolved = Number(widthPx);
    if (!Number.isFinite(resolved) || resolved <= 0) {
      resolved = minWidth;
    }
    let maxWidth = editorWidth > 0 ? editorWidth : resolved;
    if (!Number.isFinite(maxWidth) || maxWidth < minWidth) {
      maxWidth = minWidth;
    }
    const clamped = Math.max(minWidth, Math.min(resolved, maxWidth));
    const rounded = Math.round(clamped);
    img.style.width = `${rounded}px`;
    wrapper.dataset.width = img.style.width;
    wrapper.dataset.widthPx = String(rounded);
    if (editorWidth > 0) {
      const percent = Math.round((rounded / editorWidth) * 100);
      const clampedPercent = Math.max(1, Math.min(100, percent));
      wrapper.dataset.widthPercent = String(clampedPercent);
    } else {
      delete wrapper.dataset.widthPercent;
    }
  }

  function updateImageHandleAccessibility(wrapper, img, handle) {
    if (!handle || !img) return;
    const editorWidth = getEditorContentWidth();
    const rect = img.getBoundingClientRect();
    const rectWidth = rect && typeof rect.width === "number" ? rect.width : 0;
    const styleWidth = parseFloat(img.style.width);
    const width = rectWidth || (Number.isFinite(styleWidth) ? styleWidth : 0);
    if (width > 0) {
      const rounded = Math.round(width);
      const parts = [`${rounded} pixels`];
      if (editorWidth > 0) {
        const percent = Math.round((rounded / editorWidth) * 100);
        const clampedPercent = Math.max(1, Math.min(100, percent));
        handle.setAttribute("aria-valuemin", "10");
        handle.setAttribute("aria-valuemax", "100");
        handle.setAttribute("aria-valuenow", String(clampedPercent));
        handle.setAttribute(
          "aria-valuetext",
          `${rounded} pixels (${clampedPercent} %)`
        );
        parts.push(`${clampedPercent} %`);
      } else {
        handle.removeAttribute("aria-valuemin");
        handle.removeAttribute("aria-valuemax");
        handle.removeAttribute("aria-valuenow");
        handle.removeAttribute("aria-valuetext");
      }
      const label = `Redimensionner l'image (${parts.join(" · ")})`;
      handle.setAttribute("aria-label", label);
      handle.setAttribute("title", label);
    } else {
      handle.setAttribute("aria-label", "Redimensionner l'image");
      handle.setAttribute("title", "Redimensionner l'image");
      handle.removeAttribute("aria-valuemin");
      handle.removeAttribute("aria-valuemax");
      handle.removeAttribute("aria-valuenow");
      handle.removeAttribute("aria-valuetext");
    }
  }

  function ensureImageHandle(wrapper, img) {
    if (!wrapper || !img) return null;
    let handle = wrapper.querySelector(".editor-image__handle");
    if (!handle) {
      handle = document.createElement("span");
      handle.className = "editor-image__handle";
      handle.tabIndex = 0;
      handle.setAttribute("role", "slider");
      handle.setAttribute("aria-orientation", "horizontal");
      handle.setAttribute("contenteditable", "false");
      handle.setAttribute("draggable", "false");
      handle.dataset.editorImageHandle = "true";
      wrapper.appendChild(handle);
    }
    updateImageHandleAccessibility(wrapper, img, handle);
    return handle;
  }

  function unwrapEditorImage(wrapper) {
    if (!wrapper || !wrapper.parentNode) return;
    while (wrapper.firstChild) {
      wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }

  function enhanceEditorImages() {
    if (!ui.noteEditor) return;

    const wrappers = Array.from(ui.noteEditor.querySelectorAll(".editor-image"));
    wrappers.forEach((wrapper) => {
      const img = wrapper.querySelector("img");
      if (!img) {
        unwrapEditorImage(wrapper);
      }
    });

    const images = Array.from(ui.noteEditor.querySelectorAll("img"));
    const editorWidth = getEditorContentWidth();

    images.forEach((img) => {
      if (!(img instanceof HTMLImageElement)) {
        return;
      }
      let wrapper = img.parentElement;
      if (!wrapper || !wrapper.classList || !wrapper.classList.contains("editor-image")) {
        wrapper = document.createElement("span");
        wrapper.className = "editor-image";
        if (img.parentNode) {
          img.parentNode.insertBefore(wrapper, img);
        }
        wrapper.appendChild(img);
      }

      const currentWidthStyle = (img.style.width || "").trim();
      const isPercentWidth = currentWidthStyle.endsWith("%");
      if (!currentWidthStyle || isPercentWidth) {
        let baseWidth = Math.round(img.getBoundingClientRect().width);
        if (!baseWidth && img.naturalWidth) {
          baseWidth = img.naturalWidth;
        }
        if (!baseWidth && editorWidth) {
          baseWidth = editorWidth;
        }
        if (!baseWidth || !Number.isFinite(baseWidth)) {
          baseWidth = IMAGE_RESIZE_MIN_WIDTH;
        }
        applyImageWidth(wrapper, img, baseWidth);
      } else {
        const numeric = parseFloat(currentWidthStyle);
        if (Number.isFinite(numeric)) {
          applyImageWidth(wrapper, img, numeric);
        } else {
          wrapper.dataset.width = currentWidthStyle;
        }
      }

      ensureImageHandle(wrapper, img);

      if (!img.dataset.editorImageEnhanceListener) {
        img.addEventListener("load", () => {
          requestAnimationFrame(() => enhanceEditorImages());
        });
        img.dataset.editorImageEnhanceListener = "true";
      }
    });
  }

  function resetImageResizeState() {
    imageResizeState.pointerId = null;
    imageResizeState.wrapper = null;
    imageResizeState.img = null;
    imageResizeState.handle = null;
    imageResizeState.startX = 0;
    imageResizeState.startWidth = 0;
    imageResizeState.editorWidth = 0;
    imageResizeState.hasChanges = false;
    imageResizeState.savedSelection = null;
    isImageResizeActive = false;
  }

  function handleImageHandlePointerDown(event) {
    if (!event || typeof event.pointerId !== "number") return;
    const handle = event.target instanceof Element
      ? event.target.closest(".editor-image__handle")
      : null;
    if (!handle) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    if (typeof event.isPrimary === "boolean" && !event.isPrimary) return;

    const wrapper = handle.closest(".editor-image");
    const img = wrapper ? wrapper.querySelector("img") : null;
    if (!wrapper || !img) return;

    rememberEditorSelection();
    imageResizeState.savedSelection = state.savedSelection
      ? { ...state.savedSelection }
      : null;
    isImageResizeActive = true;

    event.preventDefault();
    event.stopPropagation();

    const rect = img.getBoundingClientRect();
    const rectWidth = rect && typeof rect.width === "number" ? rect.width : 0;
    const styleWidth = parseFloat(img.style.width);
    const fallbackWidth = Number.isFinite(styleWidth) && styleWidth > 0 ? styleWidth : IMAGE_RESIZE_MIN_WIDTH;
    imageResizeState.pointerId = event.pointerId;
    imageResizeState.wrapper = wrapper;
    imageResizeState.img = img;
    imageResizeState.handle = handle;
    imageResizeState.startX = event.clientX;
    imageResizeState.startWidth = rectWidth > 0 ? rectWidth : fallbackWidth;
    imageResizeState.editorWidth = getEditorContentWidth();
    imageResizeState.hasChanges = false;

    wrapper.classList.add("editor-image--resizing");
    if (typeof handle.setPointerCapture === "function") {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (error) {}
    }
    if (typeof handle.focus === "function") {
      handle.focus({ preventScroll: true });
    }
  }

  function handleImageHandlePointerMove(event) {
    if (!event || typeof event.pointerId !== "number") return;
    if (imageResizeState.pointerId === null || event.pointerId !== imageResizeState.pointerId) {
      return;
    }
    const { img, wrapper, handle, startX, startWidth } = imageResizeState;
    if (!img || !wrapper || !handle) {
      return;
    }

    event.preventDefault();

    const deltaX = event.clientX - startX;
    const editorWidth = getEditorContentWidth();
    const tentativeWidth = startWidth + deltaX;
    const minWidth = IMAGE_RESIZE_MIN_WIDTH;
    const maxWidth = editorWidth > 0 ? Math.max(editorWidth, minWidth) : Math.max(startWidth, minWidth);
    const clamped = Math.max(minWidth, Math.min(tentativeWidth, maxWidth));
    const previous = parseFloat(img.style.width);

    applyImageWidth(wrapper, img, clamped);
    updateImageHandleAccessibility(wrapper, img, handle);

    if (!Number.isFinite(previous) || Math.round(previous) !== Math.round(clamped)) {
      imageResizeState.hasChanges = true;
    }
  }

  function handleImageHandlePointerUp(event) {
    if (!event || typeof event.pointerId !== "number") return;
    if (imageResizeState.pointerId === null || event.pointerId !== imageResizeState.pointerId) {
      return;
    }
    const { handle, wrapper, hasChanges } = imageResizeState;
    const savedSelection = imageResizeState.savedSelection
      ? { ...imageResizeState.savedSelection }
      : null;

    event.preventDefault();

    if (handle && typeof handle.releasePointerCapture === "function") {
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch (error) {}
    }
    if (wrapper) {
      wrapper.classList.remove("editor-image--resizing");
    }

    resetImageResizeState();

    if (savedSelection) {
      state.savedSelection = savedSelection;
    }

    if (hasChanges) {
      enhanceEditorImages();
      handleEditorInput({ bypassReadOnly: true });
    }
  }

  function handleImageHandlePointerCancel(event) {
    if (!event || typeof event.pointerId !== "number") return;
    if (imageResizeState.pointerId === null || event.pointerId !== imageResizeState.pointerId) {
      return;
    }
    const { handle, wrapper } = imageResizeState;
    const savedSelection = imageResizeState.savedSelection
      ? { ...imageResizeState.savedSelection }
      : null;
    if (handle && typeof handle.releasePointerCapture === "function") {
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch (error) {}
    }
    if (wrapper) {
      wrapper.classList.remove("editor-image--resizing");
    }
    resetImageResizeState();
    if (savedSelection) {
      state.savedSelection = savedSelection;
    }
  }

  function handleImageHandleKeyDown(event) {
    if (!(event instanceof KeyboardEvent)) return;
    const target = event.target instanceof Element ? event.target.closest(".editor-image__handle") : null;
    if (!target) return;

    const wrapper = target.closest(".editor-image");
    const img = wrapper ? wrapper.querySelector("img") : null;
    if (!wrapper || !img) return;

    const savedSelection = state.savedSelection
      ? { ...state.savedSelection }
      : null;

    let step = event.shiftKey ? IMAGE_RESIZE_KEYBOARD_STEP_LARGE : IMAGE_RESIZE_KEYBOARD_STEP;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      step *= -1;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      step *= 1;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = img.getBoundingClientRect();
    const rectWidth = rect && typeof rect.width === "number" ? rect.width : parseFloat(img.style.width);
    const currentWidth = Number.isFinite(rectWidth) ? rectWidth : IMAGE_RESIZE_MIN_WIDTH;
    const editorWidth = getEditorContentWidth();
    const tentativeWidth = currentWidth + step;
    const minWidth = IMAGE_RESIZE_MIN_WIDTH;
    const maxWidth = editorWidth > 0 ? Math.max(editorWidth, minWidth) : Math.max(currentWidth, minWidth);
    const clamped = Math.max(minWidth, Math.min(tentativeWidth, maxWidth));

    applyImageWidth(wrapper, img, clamped);
    updateImageHandleAccessibility(wrapper, img, target);

    enhanceEditorImages();
    handleEditorInput({ bypassReadOnly: true });
    if (savedSelection) {
      state.savedSelection = savedSelection;
    }
  }

  function showEmptyEditor() {
    setRevisionMode(false);
    hideClozeFeedback();
    ui.editorWrapper.classList.add("hidden");
    ui.emptyState.classList.remove("hidden");
    ui.noteTitle.value = "";
    ui.noteEditor.innerHTML = "";
    state.fontSizeIndex = DEFAULT_FONT_SIZE_INDEX;
    state.pendingRemoteNote = null;
    state.isEditorFocused = false;
    state.savedSelection = null;
    state[CLOZE_MANUAL_REVEAL_SET_KEY] = new WeakSet();
    if (ui.blockFormat) {
      ui.blockFormat.value = "p";
    }
    if (ui.fontFamily) {
      ui.fontFamily.value = DEFAULT_FONT_FAMILY;
    }
    updateFontSizeDisplay();
    updateSaveStatus();
  }

  function applyCurrentNoteToEditor(options = {}) {
    const { force = false } = options;
    if (!state.currentNote) {
      showEmptyEditor();
      return;
    }
    hideClozeFeedback();
    ui.emptyState.classList.add("hidden");
    ui.editorWrapper.classList.remove("hidden");
    const desiredTitle = state.currentNote.title || "";
    if (force || ui.noteTitle.value !== desiredTitle) {
      ui.noteTitle.value = desiredTitle;
    }

    const desiredHtml = state.currentNote.contentHtml || "";
    const isFocused = document.activeElement === ui.noteEditor;
    const shouldUpdateContent =
      force || ((!isFocused || !state.hasUnsavedChanges) && ui.noteEditor.innerHTML !== desiredHtml);
    if (shouldUpdateContent) {
      state[CLOZE_MANUAL_REVEAL_SET_KEY] = new WeakSet();
      const selection = isFocused ? captureSelection(ui.noteEditor) : null;
      ui.noteEditor.innerHTML = desiredHtml;
      if (selection) {
        restoreSelection(ui.noteEditor, selection);
      }
      state.savedSelection = selection || null;
    }

    enhanceEditorImages();

    refreshAllClozes();

    state.lastSavedAt = state.currentNote.updatedAt instanceof Date ? state.currentNote.updatedAt : null;
    if (state.hasUnsavedChanges) {
      updateSaveStatus("dirty");
    } else {
      updateSaveStatus(state.lastSavedAt ? "saved" : "", state.lastSavedAt || null);
    }
    updateFontSizeDisplay();
    setRevisionMode(state.isRevisionMode);
    if (!state.isRevisionMode) {
      rememberEditorSelection();
    } else {
      state.savedSelection = null;
    }
  }

  function queueRemoteNoteUpdate(note) {
    const sanitized = sanitizeNoteForEditing(note);
    if (!sanitized || sanitized.id !== state.currentNoteId) {
      state.pendingRemoteNote = null;
      return;
    }
    state.pendingRemoteNote = sanitized;
  }

  function applyPendingRemoteNote() {
    if (!state.pendingRemoteNote || state.pendingRemoteNote.id !== state.currentNoteId) {
      state.pendingRemoteNote = null;
      return;
    }
    state.currentNote = sanitizeNoteForEditing(state.pendingRemoteNote);
    state.pendingRemoteNote = null;
    state.hasUnsavedChanges = false;
    applyCurrentNoteToEditor();
  }

  function updateActiveNoteHighlight() {
    const items = ui.notesContainer.querySelectorAll(".note-card");
    items.forEach((item) => {
      const noteId = item.dataset.noteId;
      const isActive = noteId === state.currentNoteId;
      item.classList.toggle("active", isActive);
      if (isActive) {
        item.setAttribute("aria-current", "true");
        item.setAttribute("aria-selected", "true");
      } else {
        item.removeAttribute("aria-current");
        item.setAttribute("aria-selected", "false");
      }
    });
  }

  function buildNoteTree(flatNotes) {
    const byId = new Map();
    flatNotes.forEach((raw) => {
      byId.set(raw.id, { ...raw, children: [] });
    });

    const roots = [];
    byId.forEach((note) => {
      const parentId = typeof note.parentId === "string" && note.parentId.trim() !== "" ? note.parentId : null;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId).children.push(note);
      } else {
        roots.push(note);
      }
    });

    const sortChildren = (collection) => {
      collection.sort((a, b) => {
        const posA = Number.isFinite(a.position) ? a.position : 0;
        const posB = Number.isFinite(b.position) ? b.position : 0;
        if (posA !== posB) {
          return posA - posB;
        }
        const updatedA = a.updatedAt instanceof Date ? a.updatedAt.getTime() : 0;
        const updatedB = b.updatedAt instanceof Date ? b.updatedAt.getTime() : 0;
        if (updatedA !== updatedB) {
          return updatedB - updatedA;
        }
        return (a.title || "").localeCompare(b.title || "");
      });
      collection.forEach((child) => sortChildren(child.children));
    };

    sortChildren(roots);

    return { roots, byId };
  }

  function getNoteFromState(noteId) {
    if (!noteId || !(state.notesById instanceof Map)) {
      return null;
    }
    return state.notesById.get(noteId) || null;
  }

  function renderNotes() {
    ui.notesContainer.innerHTML = "";

    if (!state.notes.length) {
      ui.notesContainer.removeAttribute("role");
      const empty = document.createElement("p");
      empty.className = "muted small";
      empty.textContent = "Aucune fiche pour le moment. Ajoutez-en une pour commencer.";
      ui.notesContainer.appendChild(empty);
      return;
    }

    ui.notesContainer.setAttribute("role", "tree");

    const fragment = document.createDocumentFragment();
    state.notes.forEach((note) => {
      fragment.appendChild(renderNoteNode(note, 1));
    });
    ui.notesContainer.appendChild(fragment);

    updateActiveNoteHighlight();
  }

  function renderNoteNode(note, level) {
    const resolveTitle = () =>
      note.title && note.title.trim() ? note.title.trim() : "Sans titre";
    const titleText = resolveTitle();
    const hasChildren = Array.isArray(note.children) && note.children.length > 0;
    const isCollapsed = hasChildren && state.collapsedNoteIds.has(note.id);

    const node = document.createElement("div");
    node.className = "note-node";
    node.dataset.noteId = note.id;

    const row = document.createElement("div");
    row.className = "note-row";
    row.style.setProperty("--note-depth", String(Math.max(level - 1, 0)));

    let toggleButton = null;
    let childrenContainer = null;

    if (hasChildren) {
      toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "note-toggle";
      toggleButton.dataset.noteId = note.id;
      toggleButton.setAttribute(
        "aria-label",
        `${isCollapsed ? "Développer" : "Réduire"} la fiche ${resolveTitle()}`
      );
      toggleButton.textContent = isCollapsed ? "▸" : "▾";
      toggleButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const shouldCollapse = !state.collapsedNoteIds.has(note.id);
        if (shouldCollapse) {
          state.collapsedNoteIds.add(note.id);
        } else {
          state.collapsedNoteIds.delete(note.id);
        }
        updateToggleState(toggleButton, noteCard, childrenContainer);
      });
      row.appendChild(toggleButton);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "note-toggle-spacer";
      spacer.setAttribute("aria-hidden", "true");
      row.appendChild(spacer);
    }

    const noteCard = document.createElement("button");
    noteCard.type = "button";
    noteCard.className = "note-card";
    noteCard.dataset.noteId = note.id;
    noteCard.setAttribute("role", "treeitem");
    noteCard.setAttribute("aria-level", String(level));
    if (hasChildren) {
      noteCard.setAttribute("aria-expanded", String(!isCollapsed));
    }
    noteCard.addEventListener("click", () => {
      selectNoteById(note.id).catch((error) => {
        console.error("Impossible d'ouvrir la fiche", error);
        showToast("Impossible d'ouvrir la fiche", "error");
      });
    });
    noteCard.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        if (hasChildren && state.collapsedNoteIds.has(note.id)) {
          event.preventDefault();
          state.collapsedNoteIds.delete(note.id);
          updateToggleState(toggleButton, noteCard, childrenContainer);
        } else if (hasChildren && !state.collapsedNoteIds.has(note.id)) {
          const firstChildButton = childrenContainer?.querySelector(
            ".note-card"
          );
          if (firstChildButton) {
            event.preventDefault();
            firstChildButton.focus();
          }
        }
      } else if (event.key === "ArrowLeft") {
        if (hasChildren && !state.collapsedNoteIds.has(note.id)) {
          event.preventDefault();
          state.collapsedNoteIds.add(note.id);
          updateToggleState(toggleButton, noteCard, childrenContainer);
        } else if (note.parentId) {
          const parentButton = ui.notesContainer.querySelector(
            `.note-card[data-note-id="${note.parentId}"]`
          );
          if (parentButton) {
            event.preventDefault();
            parentButton.focus();
          }
        }
      }
    });

    const title = document.createElement("span");
    title.className = "note-card-title";
    title.textContent = titleText;
    noteCard.appendChild(title);

    const meta = document.createElement("span");
    meta.className = "note-card-meta";
    meta.textContent = formatRelativeDate(note.updatedAt);
    noteCard.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "note-row-actions";

    const addChildBtn = document.createElement("button");
    addChildBtn.type = "button";
    addChildBtn.className = "icon-button note-add-child";
    addChildBtn.title = "Créer une sous-fiche";
    addChildBtn.setAttribute("aria-label", `Créer une sous-fiche dans \"${resolveTitle()}\"`);
    addChildBtn.textContent = "+";
    addChildBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      createNote(note.id).catch((error) => {
        console.error("Impossible de créer la fiche", error);
        showToast("Impossible de créer la fiche", "error");
      });
    });
    actions.appendChild(addChildBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-button note-delete";
    deleteBtn.title = "Supprimer la fiche";
    deleteBtn.setAttribute("aria-label", `Supprimer la fiche \"${resolveTitle()}\"`);
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteNote(note.id).catch((error) => {
        console.error("Impossible de supprimer la fiche", error);
        showToast("Impossible de supprimer la fiche", "error");
      });
    });
    actions.appendChild(deleteBtn);

    row.appendChild(noteCard);
    row.appendChild(actions);
    node.appendChild(row);

    if (hasChildren) {
      childrenContainer = document.createElement("div");
      childrenContainer.className = "note-children";
      childrenContainer.id = `note-children-${note.id}`;
      childrenContainer.setAttribute("role", "group");
      if (isCollapsed) {
        childrenContainer.hidden = true;
      }
      note.children.forEach((child) => {
        childrenContainer.appendChild(renderNoteNode(child, level + 1));
      });
      node.appendChild(childrenContainer);
      toggleButton.setAttribute("aria-controls", childrenContainer.id);
      toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    }

    function updateToggleState(toggleEl, noteEl, childrenEl) {
      const currentTitle = resolveTitle();
      const collapsed = state.collapsedNoteIds.has(note.id);
      if (toggleEl) {
        toggleEl.textContent = collapsed ? "▸" : "▾";
        toggleEl.setAttribute(
          "aria-label",
          `${collapsed ? "Développer" : "Réduire"} la fiche ${currentTitle}`
        );
        toggleEl.setAttribute("aria-expanded", String(!collapsed));
      }
      if (noteEl) {
        if (Array.isArray(note.children) && note.children.length > 0) {
          noteEl.setAttribute("aria-expanded", String(!collapsed));
        } else {
          noteEl.removeAttribute("aria-expanded");
        }
      }
      if (childrenEl) {
        childrenEl.hidden = collapsed;
      }
    }

    updateToggleState(toggleButton, noteCard, childrenContainer);

    return node;
  }

  function updateNotesFromSnapshot(snapshot) {
    const flatNotes = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const toDate = (value) => (value && typeof value.toDate === "function" ? value.toDate() : null);
      const rawPosition = data.position;
      let position = 0;
      if (typeof rawPosition === "number" && Number.isFinite(rawPosition)) {
        position = rawPosition;
      } else if (typeof rawPosition === "string") {
        const parsed = Number.parseFloat(rawPosition);
        if (Number.isFinite(parsed)) {
          position = parsed;
        }
      }
      return {
        id: docSnap.id,
        title: data.title || "",
        contentHtml: data.contentHtml || "",
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
        parentId:
          typeof data.parentId === "string" && data.parentId.trim() !== ""
            ? data.parentId.trim()
            : null,
        position,
      };
    });

    const { roots, byId } = buildNoteTree(flatNotes);
    const nextCollapsed = new Set();
    if (state.collapsedNoteIds instanceof Set) {
      state.collapsedNoteIds.forEach((noteId) => {
        const candidate = byId.get(noteId);
        if (candidate && Array.isArray(candidate.children) && candidate.children.length) {
          nextCollapsed.add(noteId);
        }
      });
    }
    state.collapsedNoteIds = nextCollapsed;
    state.notes = roots;
    state.notesById = byId;

    renderNotes();
    ensureCurrentSelection();
  }

  function sanitizeNoteForEditing(note) {
    if (!note) return null;
    const { children, ...rest } = note;
    return { ...rest };
  }

  function ensureCurrentSelection() {
    if (state.pendingSelectionId) {
      const pending = getNoteFromState(state.pendingSelectionId);
      if (pending) {
        state.pendingSelectionId = null;
        openNote(pending, { skipFlush: true });
      }
      return;
    }

    if (state.currentNoteId) {
      const current = getNoteFromState(state.currentNoteId);
      if (current) {
        if (state.hasUnsavedChanges && state.currentNote) {
          updateSaveStatus("dirty");
        } else if (state.isEditorFocused) {
          queueRemoteNoteUpdate(sanitizeNoteForEditing(current));
        } else {
          state.currentNote = sanitizeNoteForEditing(current);
          state.pendingRemoteNote = null;
          state.hasUnsavedChanges = false;
          applyCurrentNoteToEditor({ force: true });
        }
        updateActiveNoteHighlight();
        return;
      }
    }

    if (state.notes.length > 0) {
      openNote(state.notes[0], { skipFlush: true });
    } else {
      state.currentNoteId = null;
      state.currentNote = null;
      state.hasUnsavedChanges = false;
      showEmptyEditor();
      updateActiveNoteHighlight();
    }
  }

  async function openNote(note, options = {}) {
    if (!note) return;
    const { skipFlush = false } = options;
    if (!skipFlush) {
      await flushPendingSave();
    }
    state.currentNoteId = note.id;
    state.currentNote = sanitizeNoteForEditing(note);
    state.hasUnsavedChanges = false;
    applyCurrentNoteToEditor({ force: true });
    updateActiveNoteHighlight();
    if (!state.isRevisionMode) {
      setTimeout(() => ui.noteTitle.focus(), 80);
    }
  }

  async function selectNoteById(noteId) {
    if (!noteId) return;
    if (state.currentNoteId === noteId && state.currentNote) {
      return;
    }
    const target = getNoteFromState(noteId);
    if (!target) return;
    await openNote(target);
  }

  function updateLocalNoteCache(noteId, updates) {
    if (!(state.notesById instanceof Map)) {
      return;
    }
    const target = state.notesById.get(noteId);
    if (!target) {
      return;
    }
    Object.assign(target, updates);
  }

  function handleTitleInput(event) {
    if (!state.currentNote || state.isRevisionMode) return;
    state.currentNote.title = event.target.value;
    state.hasUnsavedChanges = true;
    state.pendingRemoteNote = null;
    updateLocalNoteCache(state.currentNoteId, { title: event.target.value });
    const activeTitle = ui.notesContainer.querySelector(
      `.note-card[data-note-id="${state.currentNoteId}"] .note-card-title`
    );
    if (activeTitle) {
      const resolvedTitle =
        state.currentNote.title && state.currentNote.title.trim()
          ? state.currentNote.title.trim()
          : "Sans titre";
      activeTitle.textContent = resolvedTitle;
      const row = activeTitle.closest(".note-row");
      if (row) {
        const addChildBtn = row.querySelector(".note-add-child");
        if (addChildBtn) {
          addChildBtn.setAttribute(
            "aria-label",
            `Créer une sous-fiche dans \"${resolvedTitle}\"`
          );
        }
        const deleteBtn = row.querySelector(".note-delete");
        if (deleteBtn) {
          deleteBtn.setAttribute(
            "aria-label",
            `Supprimer la fiche \"${resolvedTitle}\"`
          );
        }
        const toggleBtn = row.querySelector(".note-toggle");
        if (toggleBtn) {
          const isCollapsed = state.collapsedNoteIds.has(state.currentNoteId);
          toggleBtn.setAttribute(
            "aria-label",
            `${isCollapsed ? "Développer" : "Réduire"} la fiche ${resolvedTitle}`
          );
        }
      }
    }
    updateActiveNoteHighlight();
    updateSaveStatus("dirty");
    scheduleSave();
  }

  function handleEditorInput(arg = {}) {
    if (!state.currentNote) return;

    let event = null;
    let options = {};
    if (arg instanceof Event) {
      event = arg;
    } else if (arg && typeof arg === "object") {
      options = arg;
    }

    const { bypassReadOnly = false } = options;
    if (state.isRevisionMode && !bypassReadOnly) {
      return;
    }

    enhanceEditorImages();

    const isInputEvent =
      event && typeof InputEvent !== "undefined" && event instanceof InputEvent;
    const isHashInsertion =
      !state.isRevisionMode &&
      isInputEvent &&
      typeof event.data === "string" &&
      event.data === "#" &&
      typeof event.inputType === "string" &&
      event.inputType.startsWith("insert");

    const isPasteInsertion =
      !state.isRevisionMode &&
      isInputEvent &&
      ((typeof event.inputType === "string" && event.inputType === "insertFromPaste") ||
        (typeof event.data === "string" && event.data.includes("##")));

    const editorHasRawCloze = () =>
      Boolean(ui.noteEditor && typeof ui.noteEditor.textContent === "string" && ui.noteEditor.textContent.includes("##"));

    if (isHashInsertion) {
      rememberEditorSelection();
      const selectionBeforeShortcut = state.savedSelection
        ? { ...state.savedSelection }
        : null;
      const transformedResult = runWithPreservedSelection(() => applyClozeShortcut());
      const transformed =
        transformedResult && typeof transformedResult === "object"
          ? Boolean(transformedResult.success)
          : Boolean(transformedResult);
      if (!transformed && selectionBeforeShortcut) {
        focusEditorPreservingSelection(selectionBeforeShortcut);
      }
    }

    if (isPasteInsertion && editorHasRawCloze()) {
      rememberEditorSelection();
      const selectionBeforeShortcut = state.savedSelection
        ? { ...state.savedSelection }
        : null;
      let transformedAtLeastOnce = false;
      let attempts = 0;
      const MAX_TRANSFORMS = 200;
      while (editorHasRawCloze() && attempts < MAX_TRANSFORMS) {
        attempts += 1;
        const transformedResult = runWithPreservedSelection(() => applyClozeShortcut());
        const success =
          transformedResult && typeof transformedResult === "object"
            ? Boolean(transformedResult.success)
            : Boolean(transformedResult);
        if (!success) {
          break;
        }
        transformedAtLeastOnce = true;
      }
      if (!transformedAtLeastOnce && selectionBeforeShortcut) {
        focusEditorPreservingSelection(selectionBeforeShortcut);
      }
    }

    refreshAllClozes();
    state.currentNote.contentHtml = ui.noteEditor.innerHTML;
    state.hasUnsavedChanges = true;
    state.pendingRemoteNote = null;
    updateSaveStatus("dirty");
    scheduleSave();
    if (!state.isRevisionMode) {
      rememberEditorSelection();
    }
  }

  function captureSelection(container) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      return null;
    }
    const preRange = range.cloneRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    return { start, end: start + range.toString().length };
  }

  function restoreSelection(container, saved) {
    if (!saved) return;
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    let charIndex = 0;
    let startNode = null;
    let endNode = null;
    let startOffset = 0;
    let endOffset = 0;

    const traverse = (node) => {
      if (endNode) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharIndex = charIndex + node.length;
        if (!startNode && saved.start >= charIndex && saved.start <= nextCharIndex) {
          startNode = node;
          startOffset = saved.start - charIndex;
        }
        if (!endNode && saved.end >= charIndex && saved.end <= nextCharIndex) {
          endNode = node;
          endOffset = saved.end - charIndex;
        }
        charIndex = nextCharIndex;
      } else {
        for (let i = 0; i < node.childNodes.length; i += 1) {
          traverse(node.childNodes[i]);
          if (endNode) {
            break;
          }
        }
      }
    };

    traverse(container);

    if (!startNode) {
      startNode = container;
      startOffset = container.childNodes.length;
    }
    if (!endNode) {
      endNode = startNode;
      endOffset = startOffset;
    }

    range.setStart(startNode, Math.max(0, startOffset));
    range.setEnd(endNode, Math.max(0, endOffset));

    const isCollapsedSelection =
      typeof saved.start === "number" &&
      typeof saved.end === "number" &&
      saved.start === saved.end &&
      range.collapsed;

    if (isCollapsedSelection) {
      const referenceNode =
        range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
      const clozeElement =
        referenceNode && referenceNode.closest
          ? referenceNode.closest(".cloze")
          : null;

      if (clozeElement) {
        const clozeEndRange = document.createRange();
        clozeEndRange.selectNodeContents(clozeElement);
        clozeEndRange.collapse(false);

        const atClozeEnd =
          range.compareBoundaryPoints(Range.START_TO_START, clozeEndRange) === 0 &&
          range.compareBoundaryPoints(Range.END_TO_END, clozeEndRange) === 0;

        if (atClozeEnd) {
          range.setStartAfter(clozeElement);
          range.setEndAfter(clozeElement);
          range.collapse(true);
        }
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function rememberEditorSelection(event) {
    if (!ui.noteEditor) {
      state.savedSelection = null;
      return;
    }
    if (isImageResizeActive) {
      return;
    }
    const target = event && event.target instanceof Element ? event.target : null;
    if (target && target.closest && target.closest(".editor-image__handle")) {
      return;
    }
    const activeElement = document.activeElement;
    if (
      activeElement instanceof Element &&
      typeof activeElement.closest === "function" &&
      activeElement.closest(".editor-image__handle")
    ) {
      return;
    }
    state.savedSelection = captureSelection(ui.noteEditor);
  }

  function restoreEditorSelection() {
    if (!ui.noteEditor || !state.savedSelection) {
      return false;
    }
    restoreSelection(ui.noteEditor, state.savedSelection);
    return true;
  }

  function resolveSelectionOverride(override) {
    if (!override) {
      return null;
    }
    if (override instanceof Range) {
      return override;
    }
    if (override instanceof Node) {
      const range = document.createRange();
      range.setStartAfter(override);
      range.collapse(true);
      return range;
    }
    if (
      typeof override === "object" &&
      override !== null &&
      override.node instanceof Node
    ) {
      const range = document.createRange();
      const position = override.position === "before" ? "before" : "after";
      if (position === "before") {
        range.setStartBefore(override.node);
      } else {
        range.setStartAfter(override.node);
      }
      range.collapse(true);
      return range;
    }
    if (
      typeof override === "object" &&
      override !== null &&
      override.range instanceof Range
    ) {
      return override.range;
    }
    return null;
  }

  function focusEditorPreservingSelection(argument = undefined) {
    if (!ui.noteEditor) return;

    let savedSelectionOption = undefined;
    let selectionOverrideOption = null;

    if (
      argument &&
      typeof argument === "object" &&
      !("start" in argument && "end" in argument) &&
      ("savedSelection" in argument ||
        "selectionOverride" in argument ||
        "range" in argument)
    ) {
      savedSelectionOption = argument.savedSelection;
      selectionOverrideOption =
        argument.selectionOverride !== undefined
          ? argument.selectionOverride
          : argument.range;
    } else if (argument instanceof Range) {
      savedSelectionOption = null;
      selectionOverrideOption = argument;
    } else {
      savedSelectionOption = argument;
    }

    const resolvedOverride = resolveSelectionOverride(selectionOverrideOption);
    const selectionToRestore =
      savedSelectionOption !== undefined ? savedSelectionOption : state.savedSelection;

    ui.noteEditor.focus({ preventScroll: true });
    const selection = window.getSelection();
    let applied = false;

    if (selection && resolvedOverride) {
      const rangeToApply =
        typeof resolvedOverride.cloneRange === "function"
          ? resolvedOverride.cloneRange()
          : resolvedOverride;
      selection.removeAllRanges();
      selection.addRange(rangeToApply);
      applied = true;
    } else if (selection && selectionToRestore) {
      restoreSelection(ui.noteEditor, selectionToRestore);
      applied = true;
    } else if (selection && !resolvedOverride && savedSelectionOption === null) {
      selection.removeAllRanges();
    }

    rememberEditorSelection();
  }

  function runWithPreservedSelection(operation) {
    if (typeof operation !== "function") {
      return;
    }
    restoreEditorSelection();
    const result = operation();
    let selectionOverride = null;
    if (result instanceof Range || result instanceof Node) {
      selectionOverride = result;
    } else if (result && typeof result === "object") {
      if (result.selectionOverride) {
        selectionOverride = result.selectionOverride;
      } else if (result.wrapper) {
        selectionOverride = { node: result.wrapper, position: "after" };
      }
    }
    const updatedSelection = captureSelection(ui.noteEditor);
    focusEditorPreservingSelection({
      savedSelection: updatedSelection,
      selectionOverride,
    });
    return result;
  }

  function handleSelectionChange() {
    if (!state.isEditorFocused) {
      return;
    }
    rememberEditorSelection();
  }

  function scheduleSave() {
    if (!state.currentNote) return;
    if (state.pendingSave) {
      clearTimeout(state.pendingSave);
    }
    state.pendingSave = setTimeout(() => {
      state.pendingSave = null;
      saveCurrentNote().catch((error) => {
        console.error("Erreur lors de l'enregistrement", error);
        updateSaveStatus("error");
        showToast("Impossible d'enregistrer la fiche", "error");
      });
    }, SAVE_DEBOUNCE_MS);
  }

  async function saveCurrentNote() {
    if (!state.currentNote || !state.pseudo || !state.currentNoteId) return;
    if (!state.hasUnsavedChanges) return;
    updateSaveStatus("saving");
    const noteRef = doc(db, "users", state.pseudo, "notes", state.currentNoteId);
    const payload = {
      title: (state.currentNote.title || "").trim(),
      contentHtml: sanitizeHtml(state.currentNote.contentHtml || ""),
      updatedAt: serverTimestamp()
    };
    try {
      await updateDoc(noteRef, payload);
      state.hasUnsavedChanges = false;
      state.lastSavedAt = new Date();
      state.currentNote.updatedAt = state.lastSavedAt;
      updateLocalNoteCache(state.currentNoteId, { updatedAt: state.lastSavedAt });
      const meta = ui.notesContainer.querySelector(
        `.note-card[data-note-id="${state.currentNoteId}"] .note-card-meta`
      );
      if (meta) {
        meta.textContent = formatRelativeDate(state.lastSavedAt);
      }
      updateSaveStatus("saved", state.lastSavedAt);
    } catch (error) {
      state.hasUnsavedChanges = true;
      throw error;
    }
  }

  async function flushPendingSave() {
    if (state.pendingSave) {
      clearTimeout(state.pendingSave);
      state.pendingSave = null;
    }
    if (state.hasUnsavedChanges) {
      await saveCurrentNote();
    }
  }

  function applyHighlight() {
    const supportHilite =
      typeof document.queryCommandSupported === "function" && document.queryCommandSupported("hiliteColor");
    const command = supportHilite ? "hiliteColor" : "backColor";
    runWithPreservedSelection(() => {
      document.execCommand(command, false, HIGHLIGHT_COLOR);
      handleEditorInput();
    });
  }

  function generateClozePlaceholder() {
    return CLOZE_PLACEHOLDER_TEXT;
  }

  function normalizeClozePoints(value) {
    const number = typeof value === "number" ? value : parseFloat(value);
    if (!Number.isFinite(number) || number <= 0) {
      return 0;
    }
    const rounded = Math.round(number * 2) / 2;
    return Math.max(0, rounded);
  }

  function formatClozePoints(value) {
    const normalized = normalizeClozePoints(value);
    if (normalized === 0) {
      return "0";
    }
    return Number.isInteger(normalized) ? String(Math.trunc(normalized)) : normalized.toString();
  }

  function getClozePoints(cloze) {
    if (!cloze) return 0;
    return normalizeClozePoints(cloze.dataset.points);
  }

  function shouldMaskCloze(cloze, pointsValue = null) {
    if (!cloze) return true;
    if (cloze.dataset[CLOZE_DEFER_DATA_KEY] === "1") {
      return false;
    }
    if (cloze.dataset[CLOZE_MANUAL_REVEAL_DATASET_KEY] === "1") {
      return false;
    }
    if (state[CLOZE_MANUAL_REVEAL_SET_KEY] && state[CLOZE_MANUAL_REVEAL_SET_KEY].has(cloze)) {
      return false;
    }
    const points =
      pointsValue === null ? getClozePoints(cloze) : normalizeClozePoints(pointsValue);
    return points <= 0;
  }

  function updateClozeMaskState(cloze, shouldMask) {
    if (!cloze) return;
    cloze.classList.remove("cloze-revealed");
    if (shouldMask) {
      cloze.classList.add("cloze-masked");
    } else {
      cloze.classList.remove("cloze-masked");
    }
  }

  function setClozePoints(cloze, points) {
    if (!cloze) return 0;
    const normalized = normalizeClozePoints(points);
    cloze.dataset.points = formatClozePoints(normalized);
    const shouldMask = shouldMaskCloze(cloze, normalized);
    updateClozeMaskState(cloze, shouldMask);
    updateClozeTooltip(cloze, normalized);
    return normalized;
  }

  function updateClozeTooltip(cloze, pointsValue = null) {
    if (!cloze) return;
    const points = pointsValue === null ? getClozePoints(cloze) : pointsValue;
    const formatted = formatClozePoints(points);
    if (points <= 0) {
      cloze.setAttribute("title", "À réviser maintenant (compteur : 0)");
    } else {
      const suffix = points > 1 ? "s" : "";
      cloze.setAttribute("title", `Compteur : ${formatted} point${suffix}`);
    }
  }

  function updateClozeFeedbackStyle(cloze) {
    if (!cloze) return;
    CLOZE_STATUS_CLASS_VALUES.forEach((className) => {
      cloze.classList.remove(className);
    });
    const status = cloze.dataset[CLOZE_FEEDBACK_STATUS_DATASET_KEY];
    if (!status) return;
    const className = CLOZE_FEEDBACK_STATUS_CLASSES[status];
    if (className) {
      cloze.classList.add(className);
    }
  }

  function refreshClozeElement(cloze) {
    if (!cloze) return;
    const manualRevealSet = getManualRevealSet();
    const hasManualRevealAttr = cloze.dataset[CLOZE_MANUAL_REVEAL_DATASET_KEY] === "1";
    if (hasManualRevealAttr) {
      manualRevealSet.add(cloze);
    } else if (manualRevealSet.has(cloze)) {
      cloze.dataset[CLOZE_MANUAL_REVEAL_DATASET_KEY] = "1";
    }
    if (!cloze.dataset.placeholder) {
      cloze.dataset.placeholder = generateClozePlaceholder();
    }
    const points = setClozePoints(cloze, getClozePoints(cloze));
    if (shouldMaskCloze(cloze, points)) {
      cloze.setAttribute("contenteditable", "false");
    } else {
      cloze.removeAttribute("contenteditable");
    }
    updateClozeFeedbackStyle(cloze);
  }

  function refreshAllClozes() {
    if (!ui.noteEditor) return;
    const clozes = ui.noteEditor.querySelectorAll(".cloze");
    clozes.forEach((cloze) => refreshClozeElement(cloze));
  }

  function applyClozeShortcut() {
    if (state.isRevisionMode || !ui.noteEditor) {
      return { success: false };
    }

    const editor = ui.noteEditor;
    if (!editor.textContent || !editor.textContent.includes("##")) {
      return { success: false };
    }

    const selectionInfo = captureSelection(editor);
    const caretOffset = selectionInfo ? selectionInfo.start : null;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
    let traversed = 0;
    let bestMatch = null;
    let stopSearch = false;

    while (!stopSearch && walker.nextNode()) {
      const textNode = walker.currentNode;
      if (!textNode) {
        continue;
      }
      const value = textNode.nodeValue || "";
      const length = value.length;
      const parentElement = textNode.parentElement;
      if (parentElement && parentElement.closest && parentElement.closest(".cloze")) {
        traversed += length;
        continue;
      }
      if (!value.includes("##")) {
        traversed += length;
        continue;
      }

      const regex = /##([^#]+?)##/g;
      let match;
      while ((match = regex.exec(value)) !== null) {
        const fullMatch = match[0];
        if (!fullMatch) {
          continue;
        }
        const innerContent = fullMatch.slice(2, -2);
        if (!innerContent) {
          continue;
        }
        const start = match.index;
        const end = start + fullMatch.length;
        if (end <= start) {
          continue;
        }

        const globalStart = traversed + start;
        const globalEnd = traversed + end;
        const containsCaret =
          typeof caretOffset === "number" &&
          caretOffset >= globalStart &&
          caretOffset <= globalEnd;
        const distance =
          typeof caretOffset === "number"
            ? containsCaret
              ? 0
              : Math.min(
                  Math.abs(caretOffset - globalStart),
                  Math.abs(caretOffset - globalEnd)
                )
            : globalStart;

        const candidate = {
          node: textNode,
          start,
          end,
          inner: innerContent,
          containsCaret,
          distance,
          globalStart,
        };

        if (!bestMatch) {
          bestMatch = candidate;
        } else if (candidate.containsCaret && !bestMatch.containsCaret) {
          bestMatch = candidate;
        } else if (candidate.containsCaret === bestMatch.containsCaret) {
          if (
            candidate.distance < bestMatch.distance ||
            (candidate.distance === bestMatch.distance &&
              candidate.globalStart >= bestMatch.globalStart)
          ) {
            bestMatch = candidate;
          }
        }

        if (candidate.containsCaret) {
          stopSearch = true;
          break;
        }
      }

      traversed += length;
    }

    if (!bestMatch || !bestMatch.node || !bestMatch.node.parentNode) {
      return { success: false };
    }

    const { node, start, end, inner } = bestMatch;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);

    const wrapper = document.createElement("span");
    wrapper.className = "cloze";
    wrapper.dataset.placeholder = generateClozePlaceholder();
    wrapper.dataset.points = "0";
    wrapper.classList.add("cloze-masked");

    const innerNode = document.createTextNode(inner);
    wrapper.appendChild(innerNode);

    range.deleteContents();
    range.insertNode(wrapper);
    refreshClozeElement(wrapper);

    const selectionOverride = (() => {
      try {
        const afterRange = document.createRange();
        afterRange.setStartAfter(wrapper);
        afterRange.collapse(true);
        return afterRange;
      } catch (error) {
        console.error("Impossible de calculer la nouvelle position du curseur", error);
        return null;
      }
    })();

    return {
      success: true,
      wrapper,
      selectionOverride,
    };
  }

  function createClozeFromSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      showToast("Sélectionnez du texte à transformer en trou.", "warning");
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      showToast("Sélectionnez le texte à masquer pour créer un trou.", "warning");
      return;
    }
    if (!ui.noteEditor.contains(range.commonAncestorContainer)) {
      showToast("Les trous ne peuvent être créés que dans l'éditeur.", "warning");
      return;
    }

    const wrapper = document.createElement("span");
    wrapper.className = "cloze";
    const placeholder = generateClozePlaceholder();
    wrapper.dataset.placeholder = placeholder;
    wrapper.dataset.points = "0";
    wrapper.classList.add("cloze-masked");

    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    selection.removeAllRanges();
    const afterRange = document.createRange();
    afterRange.setStartAfter(wrapper);
    afterRange.collapse(true);
    selection.addRange(afterRange);
    ui.noteEditor.focus();
    refreshClozeElement(wrapper);
    handleEditorInput();
  }

  function startNewIteration() {
    if (!state.currentNote) {
      showToast("Sélectionnez une fiche pour lancer une itération.", "info");
      return;
    }
    hideClozeFeedback();
    if (!ui.noteEditor) return;
    const clozes = Array.from(ui.noteEditor.querySelectorAll(".cloze"));
    if (!clozes.length) {
      showToast("Aucun trou dans cette fiche pour le moment.", "info");
      return;
    }

    state[CLOZE_MANUAL_REVEAL_SET_KEY] = new WeakSet();
    let changed = false;
    let reactivatedCount = 0;
    let skippedCount = 0;

    clozes.forEach((cloze) => {
      delete cloze.dataset[CLOZE_MANUAL_REVEAL_DATASET_KEY];
      if (cloze.dataset[CLOZE_FEEDBACK_STATUS_DATASET_KEY]) {
        delete cloze.dataset[CLOZE_FEEDBACK_STATUS_DATASET_KEY];
      }
      updateClozeFeedbackStyle(cloze);
      const hadDeferred = cloze.dataset[CLOZE_DEFER_DATA_KEY] === "1";
      if (hadDeferred) {
        delete cloze.dataset[CLOZE_DEFER_DATA_KEY];
        changed = true;
        reactivatedCount += 1;
      }

      const current = getClozePoints(cloze);
      let next = current;

      if (current > 0) {
        skippedCount += 1;
        next = Math.max(0, current - 1);
        if (next === 0) {
          cloze.dataset[CLOZE_DEFER_DATA_KEY] = "1";
        }
      }

      if (next !== current) {
        changed = true;
      }

      setClozePoints(cloze, next);
      cloze.classList.remove("cloze-revealed");
    });

    refreshAllClozes();

    if (changed) {
      handleEditorInput({ bypassReadOnly: true });
      const messages = [];
      if (reactivatedCount > 0) {
        const plural = reactivatedCount > 1 ? "s" : "";
        messages.push(`${reactivatedCount} trou${plural} reviennent en révision.`);
      }
      if (skippedCount > 0) {
        const pluralSkip = skippedCount > 1 ? "s" : "";
        messages.push(`${skippedCount} trou${pluralSkip} mis en pause pour cette itération.`);
      }
      const combinedMessage = messages.length
        ? messages.join(" ")
        : "Compteurs mis à jour.";
      showToast(`Nouvelle itération : ${combinedMessage}`, "success");
    } else {
      showToast("Nouvelle itération : aucun compteur à réduire.", "info");
    }
  }

  function getCurrentFontSize() {
    return FONT_SIZE_STEPS[state.fontSizeIndex] || FONT_SIZE_STEPS[DEFAULT_FONT_SIZE_INDEX];
  }

  function updateFontSizeDisplay() {
    if (ui.fontSizeValue) {
      ui.fontSizeValue.textContent = getCurrentFontSize();
    }
  }

  function applyFontSize(size) {
    if (!size || !ui.noteEditor) return;
    runWithPreservedSelection(() => {
      document.execCommand("fontSize", false, "7");
      const fonts = ui.noteEditor.querySelectorAll('font[size="7"]');
      fonts.forEach((font) => {
        const span = document.createElement("span");
        span.style.fontSize = `${size}pt`;
        while (font.firstChild) {
          span.appendChild(font.firstChild);
        }
        font.replaceWith(span);
      });
      handleEditorInput();
    });
  }

  function adjustFontSize(delta) {
    const newIndex = Math.min(Math.max(state.fontSizeIndex + delta, 0), FONT_SIZE_STEPS.length - 1);
    if (newIndex === state.fontSizeIndex) return;
    state.fontSizeIndex = newIndex;
    applyFontSize(getCurrentFontSize());
    updateFontSizeDisplay();
  }

  function applyTextColor(color) {
    const value = typeof color === "string" && color.trim() ? color : DEFAULT_TEXT_COLOR;
    runWithPreservedSelection(() => {
      document.execCommand("foreColor", false, value);
      handleEditorInput();
    });
  }

  function clearActiveCloze() {
    if (state.activeCloze) {
      state.activeCloze.classList.remove("cloze-revealed");
      state.activeCloze = null;
    }
  }

  function hideClozeFeedback() {
    if (ui.clozeFeedback) {
      ui.clozeFeedback.classList.add("hidden");
      ui.clozeFeedback.style.top = "";
      ui.clozeFeedback.style.left = "";
    }
    clearActiveCloze();
  }

  function handleWindowResize() {
    if (state.activeCloze) {
      positionClozeFeedback(state.activeCloze);
      requestAnimationFrame(() => positionClozeFeedback(state.activeCloze));
      return;
    }
    hideClozeFeedback();
  }

  function positionClozeFeedback(target) {
    if (!ui.clozeFeedback || !target) return;
    const wrapperRect = ui.editorWrapper.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = targetRect.bottom - wrapperRect.top + 8;
    const center = targetRect.left - wrapperRect.left + targetRect.width / 2;
    const feedbackRect = ui.clozeFeedback.getBoundingClientRect();
    const halfWidth = feedbackRect.width / 2 || 0;
    const margin = 16;
    const minLeft = halfWidth + margin;
    const maxLeft = Math.max(minLeft, wrapperRect.width - margin - halfWidth);
    const left = Math.max(minLeft, Math.min(center, maxLeft));
    ui.clozeFeedback.style.top = `${top}px`;
    ui.clozeFeedback.style.left = `${left}px`;
  }

  function showClozeFeedback(target) {
    if (!ui.clozeFeedback || !target) return;
    state.activeCloze = target;
    target.classList.add("cloze-revealed");
    ui.clozeFeedback.classList.remove("hidden");
    positionClozeFeedback(target);
    requestAnimationFrame(() => positionClozeFeedback(target));
  }

  function handleEditorClick(event) {
    const cloze = closestElement(event.target, ".cloze");
    if (!cloze) {
      hideClozeFeedback();
      return;
    }

    const wasMasked = cloze.classList.contains("cloze-masked");
    const manualRevealSet = getManualRevealSet();
    if (wasMasked) {
      manualRevealSet.add(cloze);
      cloze.dataset[CLOZE_MANUAL_REVEAL_DATASET_KEY] = "1";
      refreshClozeElement(cloze);
    }

    const isManuallyRevealed = manualRevealSet.has(cloze);
    if (!wasMasked && !isManuallyRevealed) {
      hideClozeFeedback();
      return;
    }

    event.preventDefault();
    hideClozeFeedback();
    showClozeFeedback(cloze);
  }

  function handleClozeFeedbackClick(event) {
    const button = closestElement(event.target, "button[data-feedback]");
    if (!button) return;
    event.preventDefault();
    const cloze = state.activeCloze;
    const feedbackKey = button.dataset.feedback;
    const feedback = CLOZE_FEEDBACK_RULES[feedbackKey];
    if (!cloze || !feedback) {
      hideClozeFeedback();
      return;
    }

    const currentPoints = getClozePoints(cloze);
    const newPoints = feedback.reset ? 0 : currentPoints + (feedback.delta || 0);
    if (feedback.reset && cloze.dataset[CLOZE_DEFER_DATA_KEY]) {
      delete cloze.dataset[CLOZE_DEFER_DATA_KEY];
    }
    if (feedbackKey && CLOZE_FEEDBACK_STATUS_CLASSES[feedbackKey]) {
      cloze.dataset[CLOZE_FEEDBACK_STATUS_DATASET_KEY] = feedbackKey;
    } else {
      delete cloze.dataset[CLOZE_FEEDBACK_STATUS_DATASET_KEY];
    }
    const appliedPoints = setClozePoints(cloze, newPoints);
    refreshClozeElement(cloze);
    handleEditorInput({ bypassReadOnly: true });
    hideClozeFeedback();

    const label = feedback.label || button.textContent.trim();
    const pointsLabel = formatClozePoints(appliedPoints);
    const toastType = feedback.toastType || (feedback.reset ? "warning" : "success");
    const suffix = appliedPoints > 1 ? "s" : "";
    const counterMessage = appliedPoints > 0
      ? `Compteur : ${pointsLabel} point${suffix}`
      : "Compteur remis à 0";
    showToast(`Auto-évaluation : ${label} • ${counterMessage}`, toastType);
  }

  function handleDocumentClick(event) {
    if (!ui.clozeFeedback || ui.clozeFeedback.classList.contains("hidden")) {
      return;
    }
    if (ui.clozeFeedback.contains(event.target)) {
      return;
    }
    if (closestElement(event.target, ".cloze")) {
      return;
    }
    hideClozeFeedback();
  }

  function handleToolbarChange(event) {
    const select = closestElement(event.target, "select[data-command]");
    if (!select || !state.currentNote) return;
    if (state.isRevisionMode) {
      event.preventDefault();
      return;
    }
    let value = select.value;
    const command = select.dataset.command;
    if (command === "formatBlock" && value && !value.startsWith("<")) {
      value = `<${value}>`;
    }
    runWithPreservedSelection(() => {
      document.execCommand(command, false, value);
      handleEditorInput();
    });
  }

  function handleToolbarClick(event) {
    const button = closestElement(event.target, "button[data-command], button[data-action]");
    if (!button || !state.currentNote) return;
    const command = button.dataset.command;
    const action = button.dataset.action;
    if (state.isRevisionMode) {
      if (action === "startIteration") {
        event.preventDefault();
        startNewIteration();
        return;
      }
      event.preventDefault();
      return;
    }
    let handledBySelectionHelper = false;
    if (command) {
      let value = button.dataset.value || null;
      if (command === "formatBlock" && value && !/^</.test(value)) {
        value = `<${value}>`;
      }
      handledBySelectionHelper = true;
      runWithPreservedSelection(() => {
        document.execCommand(command, false, value);
        handleEditorInput();
      });
    } else if (action) {
      if (action === "applyHighlight") {
        handledBySelectionHelper = true;
        applyHighlight();
      } else if (action === "applyTextColor") {
        handledBySelectionHelper = true;
        applyTextColor(button.dataset.value);
      } else if (action === "increaseFontSize") {
        handledBySelectionHelper = true;
        adjustFontSize(1);
      } else if (action === "decreaseFontSize") {
        handledBySelectionHelper = true;
        adjustFontSize(-1);
      } else if (action === "createCloze") {
        handledBySelectionHelper = true;
        runWithPreservedSelection(() => {
          createClozeFromSelection();
        });
      } else if (action === "startIteration") {
        startNewIteration();
      }
    }
    if (!handledBySelectionHelper || action === "startIteration") {
      focusEditorPreservingSelection();
    }
    if (
      mobileMediaQuery.matches &&
      ui.toolbarMorePanel &&
      ui.toolbarMorePanel.classList.contains("is-open") &&
      ui.toolbarMorePanel.contains(button)
    ) {
      setToolbarMoreMenu(false);
    }
  }

  function getSiblingCollection(parentId) {
    if (!parentId) {
      return state.notes;
    }
    const parent = getNoteFromState(parentId);
    return parent && Array.isArray(parent.children) ? parent.children : [];
  }

  function getNextSiblingPosition(parentId) {
    const siblings = getSiblingCollection(parentId);
    if (!siblings || siblings.length === 0) {
      return 0;
    }
    return (
      siblings.reduce((max, sibling) => {
        const value = Number.isFinite(sibling.position) ? sibling.position : 0;
        return Math.max(max, value);
      }, 0) + 1
    );
  }

  async function createNote(parentId = null) {
    if (!state.pseudo) return;
    const safeParentId = typeof parentId === "string" && parentId.trim() !== "" ? parentId.trim() : null;
    try {
      const notesRef = collection(db, "users", state.pseudo, "notes");
      const payload = {
        title: "Nouvelle fiche",
        contentHtml: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        parentId: safeParentId,
        position: getNextSiblingPosition(safeParentId),
      };
      const docRef = await addDoc(notesRef, payload);
      if (safeParentId) {
        state.collapsedNoteIds.delete(safeParentId);
      }
      state.pendingSelectionId = docRef.id;
      showToast("Fiche créée", "success");
    } catch (error) {
      if (isPermissionDenied(error)) {
        reportPermissionIssue("Création de fiche refusée par Firestore");
      } else {
        console.error("Impossible de créer la fiche", error);
        showToast("Impossible de créer la fiche", "error");
      }
    }
  }

  function collectDescendantIds(note) {
    if (!note || !Array.isArray(note.children)) {
      return [];
    }
    const stack = [...note.children];
    const ids = [];
    while (stack.length) {
      const current = stack.pop();
      ids.push(current.id);
      if (Array.isArray(current.children) && current.children.length) {
        stack.push(...current.children);
      }
    }
    return ids;
  }

  function collectNoteHierarchyIds(noteId) {
    const root = getNoteFromState(noteId);
    if (!root) {
      return [noteId];
    }
    return [root.id, ...collectDescendantIds(root)];
  }

  function countDescendants(note) {
    if (!note || !Array.isArray(note.children)) {
      return 0;
    }
    return note.children.reduce((total, child) => total + 1 + countDescendants(child), 0);
  }

  async function deleteNote(noteId) {
    if (!state.pseudo || !noteId) return;
    const note = getNoteFromState(noteId);
    const titleText = note?.title && note.title.trim() ? note.title.trim() : "Sans titre";
    const descendantCount = note ? countDescendants(note) : 0;
    const confirmationMessage =
      descendantCount > 0
        ? `Supprimer la fiche "${titleText}" et ses ${descendantCount} sous-fiche${
            descendantCount > 1 ? "s" : ""
          } ?`
        : `Supprimer la fiche "${titleText}" ?`;
    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) return;
    try {
      await flushPendingSave();
      const idsToDelete = collectNoteHierarchyIds(noteId);
      for (const id of idsToDelete) {
        await deleteDoc(doc(db, "users", state.pseudo, "notes", id));
        state.collapsedNoteIds.delete(id);
      }
      if (state.currentNoteId && idsToDelete.includes(state.currentNoteId)) {
        state.currentNoteId = null;
        state.currentNote = null;
        state.hasUnsavedChanges = false;
        showEmptyEditor();
      }
      showToast("Fiche supprimée", "success");
    } catch (error) {
      throw error;
    }
  }

  async function ensureUserExists(pseudo, options = {}) {
    const ref = doc(db, "users", pseudo);
    const desiredVisibility = sanitizeVisibility(options.visibility);
    const desiredDisplayName =
      typeof options.displayName === "string" && options.displayName.trim()
        ? options.displayName.trim()
        : "";

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const newData = {
        createdAt: serverTimestamp(),
        visibility: desiredVisibility,
      };
      if (desiredDisplayName) {
        newData.displayName = desiredDisplayName;
      }
      await setDoc(ref, newData);
      return {
        visibility: desiredVisibility,
        displayName: desiredDisplayName || null,
      };
    }

    const data = snap.data() || {};
    const updates = {};
    let resolvedVisibility = data.visibility === "public" ? "public" : "private";
    if (!("visibility" in data) || resolvedVisibility !== desiredVisibility) {
      updates.visibility = desiredVisibility;
      resolvedVisibility = desiredVisibility;
    }

    let resolvedDisplayName =
      typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName.trim()
        : "";
    if (desiredDisplayName && resolvedDisplayName !== desiredDisplayName) {
      updates.displayName = desiredDisplayName;
      resolvedDisplayName = desiredDisplayName;
    }

    if (Object.keys(updates).length > 0) {
      await updateDoc(ref, updates);
    }

    return {
      visibility: resolvedVisibility,
      displayName: resolvedDisplayName || null,
    };
  }

  function subscribeToNotes() {
    if (!state.pseudo) return;
    const ref = collection(db, "users", state.pseudo, "notes");
    const q = query(ref, orderBy("parentId"), orderBy("position"), orderBy("updatedAt", "desc"));
    if (state.notesUnsubscribe) {
      state.notesUnsubscribe();
    }
    state.notesUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        updateNotesFromSnapshot(snapshot);
      },
      (error) => {
        if (isPermissionDenied(error)) {
          reportPermissionIssue("Lecture des fiches refusée par Firestore");
        } else {
          console.error("Erreur lors du chargement des fiches", error);
          showToast("Impossible de charger vos fiches", "error");
        }
      }
    );
  }

  function updatePublicUsersList(users) {
    state.publicUsers = users;
    if (!ui.publicUsersList || !ui.publicUsersEmpty) {
      return;
    }
    ui.publicUsersList.innerHTML = "";
    if (!users || users.length === 0) {
      ui.publicUsersEmpty.textContent = defaultPublicUsersEmptyMessage;
      ui.publicUsersEmpty.classList.remove("hidden");
      return;
    }
    ui.publicUsersEmpty.classList.add("hidden");
    const fragment = document.createDocumentFragment();
    users.forEach((userInfo) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "public-user-button";
      button.dataset.pseudo = userInfo.id;
      button.setAttribute("role", "listitem");
      button.title = `Utiliser le compte public ${userInfo.displayName}`;

      const name = document.createElement("span");
      name.className = "public-user-name";
      name.textContent = userInfo.displayName;

      const pseudo = document.createElement("span");
      pseudo.className = "public-user-pseudo";
      pseudo.textContent = `@${userInfo.id}`;

      button.append(name, pseudo);
      fragment.appendChild(button);
    });
    ui.publicUsersList.appendChild(fragment);
  }

  function subscribeToPublicUsers() {
    if (!ui.publicUsersList) {
      return;
    }
    if (state.publicUsersUnsubscribe) {
      state.publicUsersUnsubscribe();
      state.publicUsersUnsubscribe = null;
    }
    const usersRef = collection(db, "users");
    const publicUsersQuery = query(usersRef, where("visibility", "==", "public"));
    state.publicUsersUnsubscribe = onSnapshot(
      publicUsersQuery,
      (snapshot) => {
        const users = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() || {};
          if (sanitizeVisibility(data.visibility) !== "public") {
            return;
          }
          const displayName =
            typeof data.displayName === "string" && data.displayName.trim()
              ? data.displayName.trim()
              : docSnap.id;
          users.push({ id: docSnap.id, displayName });
        });
        users.sort((a, b) => {
          const nameOrder = a.displayName.localeCompare(b.displayName, "fr", {
            sensitivity: "base",
          });
          if (nameOrder !== 0) {
            return nameOrder;
          }
          return a.id.localeCompare(b.id, "fr", { sensitivity: "base" });
        });
        updatePublicUsersList(users);
      },
      (error) => {
        console.error("Erreur lors du chargement des comptes publics", error);
        updatePublicUsersList([]);
        if (ui.publicUsersEmpty) {
          ui.publicUsersEmpty.textContent =
            "Impossible de charger les comptes publics pour le moment.";
          ui.publicUsersEmpty.classList.remove("hidden");
        }
      }
    );
  }

  function handlePublicUsersClick(event) {
    const source = event.target instanceof Element ? event.target : null;
    const target = source?.closest("[data-pseudo]");
    if (!target) {
      return;
    }
    const pseudo = target.getAttribute("data-pseudo");
    if (!pseudo || !ui.pseudoInput) {
      return;
    }
    ui.pseudoInput.value = pseudo;
    ui.pseudoInput.focus();
    const publicOption = ui.visibilityInputs.find((input) => input.value === "public");
    if (publicOption) {
      publicOption.checked = true;
    }
  }

  function resetState() {
    if (state.notesUnsubscribe) {
      state.notesUnsubscribe();
      state.notesUnsubscribe = null;
    }
    if (state.pendingSave) {
      clearTimeout(state.pendingSave);
      state.pendingSave = null;
    }
    state.pseudo = null;
    state.displayName = null;
    state.visibility = null;
    state.pendingDisplayName = null;
    state.pendingVisibility = null;
    state.notes = [];
    state.notesById = new Map();
    state.collapsedNoteIds = new Set();
    state.currentNoteId = null;
    state.currentNote = null;
    state.pendingSelectionId = null;
    state.hasUnsavedChanges = false;
    state.lastSavedAt = null;
    state.pendingRemoteNote = null;
    state.isEditorFocused = false;
    ui.notesContainer.innerHTML = "";
    showEmptyEditor();
    ui.currentUser.textContent = "";
    ui.logoutBtn.disabled = true;
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const { pseudoKey, displayName } = normalizePseudoInput(ui.pseudoInput.value);
    const selectedVisibility = sanitizeVisibility(ui.visibilityField?.value);
    if (!pseudoKey || pseudoKey.length < MIN_PSEUDO_LENGTH) {
      showToast(
        `Pseudo invalide. Utilisez au moins ${MIN_PSEUDO_LENGTH} caractères autorisés (lettres, chiffres, . _ -).`,
        "error"
      );
      return;
    }
    ui.loginButton.disabled = true;
    ui.pseudoInput.disabled = true;
    ui.visibilityInputs.forEach((input) => {
      input.disabled = true;
    });
    state.pendingVisibility = selectedVisibility;
    try {
      await login(pseudoKey, displayName, selectedVisibility);
    } catch (error) {
      console.error(error);
      let message = "Impossible de se connecter";
      switch (error?.code) {
        case "auth/invalid-email":
        case "auth/missing-email":
          message = "Pseudo invalide. Vérifiez les caractères utilisés.";
          break;
        case "auth/configuration-not-found":
        case "auth/operation-not-allowed":
          message =
            "La connexion e-mail/mot de passe n'est pas configurée. Vérifiez firebase-config.js puis activez la méthode 'Email/Mot de passe' dans Firebase Authentication.";
          break;
        case "auth/too-many-requests":
          message = "Trop de tentatives de connexion. Réessayez plus tard.";
          break;
        case "auth/network-request-failed":
          message = "Connexion réseau requise pour accéder à vos fiches.";
          break;
        case "auth/wrong-password":
          message = "Ce pseudo est déjà utilisé avec un autre mot de passe.";
          break;
        default:
          break;
      }
      showToast(message, "error");
    } finally {
      ui.loginButton.disabled = false;
      ui.pseudoInput.disabled = false;
      ui.visibilityInputs.forEach((input) => {
        input.disabled = false;
      });
    }
  }

  async function login(pseudoKey, displayName, visibility) {
    state.pendingDisplayName = displayName;
    state.pendingVisibility = sanitizeVisibility(visibility);
    const email = buildAuthEmail(pseudoKey);
    const password = buildAuthPassword(pseudoKey);
    try {
      let credential = null;
      try {
        credential = await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        if (error?.code === "auth/user-not-found" || error?.code === "auth/invalid-credential") {
          credential = await createUserWithEmailAndPassword(auth, email, password);
          if (credential.user && displayName) {
            try {
              await updateProfile(credential.user, { displayName });
            } catch (profileError) {
              console.warn("Impossible de mettre à jour le profil", profileError);
            }
          }
        } else {
          throw error;
        }
      }
      const currentUser = credential?.user || auth.currentUser;
      if (currentUser && displayName && currentUser.displayName !== displayName) {
        try {
          await updateProfile(currentUser, { displayName });
        } catch (profileError) {
          console.warn("Impossible de mettre à jour le profil", profileError);
        }
      }
      const ensuredUser = await ensureUserExists(pseudoKey, {
        visibility: state.pendingVisibility,
        displayName,
      });
      if (ensuredUser?.visibility) {
        state.pendingVisibility = ensuredUser.visibility;
      }
    } catch (error) {
      state.pendingDisplayName = null;
      state.pendingVisibility = null;
      throw error;
    }
  }

  async function handleAuthState(user) {
    const pendingDisplayName = state.pendingDisplayName;
    const pendingVisibility = state.pendingVisibility;
    resetState();
    if (!user) {
      if (ui.loginForm) {
        ui.loginForm.reset();
      }
      if (ui.visibilityInputs.length) {
        const privateOption = ui.visibilityInputs.find((input) => input.value === "private");
        if (privateOption) {
          privateOption.checked = true;
        }
      }
      showView("login");
      return;
    }

    const pseudoKey = extractPseudoFromEmail(user.email || "");
    if (!pseudoKey) {
      console.error("Utilisateur connecté avec une adresse e-mail inattendue", user.email);
      showToast("Profil invalide détecté. Déconnexion en cours.", "error");
      await signOut(auth);
      return;
    }

    state.pseudo = pseudoKey;

    let userDocData = null;
    try {
      const snapshot = await getDoc(doc(db, "users", pseudoKey));
      if (snapshot.exists()) {
        userDocData = snapshot.data() || {};
      }
    } catch (error) {
      console.warn("Impossible de récupérer le profil utilisateur", error);
    }

    const docDisplayName =
      typeof userDocData?.displayName === "string" && userDocData.displayName.trim()
        ? userDocData.displayName.trim()
        : "";
    const resolvedDisplayName =
      user.displayName ||
      pendingDisplayName ||
      docDisplayName ||
      pseudoKey;
    state.displayName = resolvedDisplayName;
    state.pendingDisplayName = null;

    const resolvedVisibility = userDocData
      ? sanitizeVisibility(userDocData.visibility)
      : sanitizeVisibility(pendingVisibility);
    state.visibility = resolvedVisibility;
    state.pendingVisibility = null;

    const visibilityLabel =
      resolvedVisibility === "public" ? "compte public" : "compte privé";
    ui.currentUser.textContent = `Connecté en tant que ${resolvedDisplayName} · ${visibilityLabel}`;
    ui.logoutBtn.disabled = false;
    if (ui.loginForm) {
      ui.loginForm.reset();
    }
    if (ui.visibilityInputs.length) {
      const privateOption = ui.visibilityInputs.find((input) => input.value === "private");
      if (privateOption) {
        privateOption.checked = true;
      }
    }
    subscribeToNotes();
    showView("workspace");
  }

  async function logout() {
    ui.logoutBtn.disabled = true;
    closeHeaderMenu();
    setNotesDrawer(false);
    setSidebarCollapsed(false);
    try {
      await flushPendingSave();
      await signOut(auth);
    } catch (error) {
      console.error(error);
      ui.logoutBtn.disabled = false;
      showToast("Impossible de se déconnecter", "error");
    }
  }

  async function initAuth() {
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (error) {
      console.warn("Impossible de configurer la persistance de l'authentification", error);
    }
    onAuthStateChanged(auth, (user) => {
      handleAuthState(user).catch((err) => {
        console.error("Erreur lors du traitement de l'état d'authentification", err);
        showToast("Erreur d'authentification", "error");
      });
    });
  }

  function initEvents() {
    ui.loginForm.addEventListener("submit", handleLoginSubmit);
    if (ui.publicUsersList) {
      ui.publicUsersList.addEventListener("click", handlePublicUsersClick);
    }
    ui.logoutBtn.addEventListener("click", logout);
    ui.addNoteBtn.addEventListener("click", () => {
      createNote().catch((error) => {
        console.error(error);
      });
    });
    ui.noteTitle.addEventListener("input", handleTitleInput);
    ui.noteEditor.addEventListener("input", handleEditorInput);
    ui.noteEditor.addEventListener("click", handleEditorClick);
    ui.noteEditor.addEventListener("scroll", hideClozeFeedback);
    ui.noteEditor.addEventListener("focus", handleEditorFocus);
    ui.noteEditor.addEventListener("pointerdown", handleImageHandlePointerDown);
    ui.noteEditor.addEventListener("keydown", handleImageHandleKeyDown);
    ui.noteEditor.addEventListener("keyup", rememberEditorSelection);
    ui.noteEditor.addEventListener("mouseup", rememberEditorSelection);
    ui.noteEditor.addEventListener("touchend", rememberEditorSelection);
    ui.noteEditor.addEventListener("blur", handleEditorBlur);
    ui.toolbar.addEventListener("click", handleToolbarClick);
    ui.toolbar.addEventListener("change", handleToolbarChange);
    if (ui.toolbarMoreBtn) {
      ui.toolbarMoreBtn.addEventListener("click", () => toggleToolbarMoreMenu());
    }
    if (ui.clozeFeedback) {
      ui.clozeFeedback.addEventListener("click", handleClozeFeedbackClick);
    }
    if (ui.revisionModeToggle) {
      ui.revisionModeToggle.addEventListener("click", () => {
        setRevisionMode(!state.isRevisionMode);
      });
    }
    if (ui.revisionIterationBtn) {
      ui.revisionIterationBtn.addEventListener("click", () => {
        if (state.isRevisionMode) {
          startNewIteration();
        }
      });
    }
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("pointermove", handleImageHandlePointerMove);
    window.addEventListener("pointerup", handleImageHandlePointerUp);
    window.addEventListener("pointercancel", handleImageHandlePointerCancel);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("beforeunload", (event) => {
      if (state.hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  subscribeToPublicUsers();
  initEvents();
  updateToolbarFormattingLayout();
  if (typeof mobileMediaQuery.addEventListener === "function") {
    mobileMediaQuery.addEventListener("change", updateToolbarFormattingLayout);
  } else if (typeof mobileMediaQuery.addListener === "function") {
    mobileMediaQuery.addListener(updateToolbarFormattingLayout);
  }
  initAuth();
}
