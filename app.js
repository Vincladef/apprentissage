import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  startAt,
  endAt,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { signIn, signUp, resetPassword } from "./auth.js";
import { shareNoteByEmail } from "./sharing.js";

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

  const SAVE_DEBOUNCE_MS = 700;
  const HIGHLIGHT_COLOR = "#fde68a";
  const DEFAULT_TEXT_COLOR = "#1f2937";
  const DEFAULT_FONT_FAMILY = "Arial";
  const FONT_SIZE_STEPS = [10, 11, 12, 14, 18, 24, 32];
  const DEFAULT_FONT_SIZE_INDEX = 1;
  const IMAGE_RESIZE_MIN_WIDTH = 80;
  const IMAGE_RESIZE_MIN_HEIGHT = 80;
  const IMAGE_RESIZE_KEYBOARD_STEP = 10;
  const IMAGE_RESIZE_KEYBOARD_STEP_LARGE = 40;
  const IMAGE_CROP_MIN_SIZE = 24;
  const IMAGE_HANDLE_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
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

  const SHARE_ROLE_VIEWER = "viewer";
  const SHARE_ROLE_EDITOR = "editor";
  const SHARE_ROLES = new Set([SHARE_ROLE_VIEWER, SHARE_ROLE_EDITOR]);
  const SHARE_ROLE_LABELS = {
    [SHARE_ROLE_VIEWER]: "Lecteur",
    [SHARE_ROLE_EDITOR]: "Éditeur",
  };
  const SHARE_SEARCH_DEBOUNCE_MS = 320;

  function normalizeShareRole(role) {
    if (typeof role === "string") {
      const normalized = role.trim().toLowerCase();
      if (SHARE_ROLES.has(normalized)) {
        return normalized;
      }
    }
    return SHARE_ROLE_VIEWER;
  }

  function sanitizeMembersRecord(rawMembers) {
    if (!rawMembers || typeof rawMembers !== "object" || Array.isArray(rawMembers)) {
      return {};
    }
    return Object.entries(rawMembers).reduce((acc, [uid, value]) => {
      if (typeof uid === "string" && uid && uid !== "__proto__") {
        acc[uid] = normalizeShareRole(value);
      }
      return acc;
    }, {});
  }

  function normalizeShareProfile(userId, data = {}, fallback = {}) {
    const rawPseudo = typeof data?.pseudo === "string" ? data.pseudo.trim() : "";
    const rawEmail = typeof data?.email === "string" ? data.email.trim() : "";
    const fallbackPseudo = typeof fallback?.pseudo === "string" ? fallback.pseudo.trim() : "";
    const fallbackEmail = typeof fallback?.email === "string" ? fallback.email.trim() : "";
    const fallbackDisplay = typeof fallback?.displayName === "string" ? fallback.displayName.trim() : "";
    const pseudo = rawPseudo || fallbackPseudo;
    const email = rawEmail || fallbackEmail;
    const displayName = fallbackDisplay || pseudo || email || userId;
    return { uid: userId, pseudo, email, displayName };
  }

  function createShareState(options = {}) {
    const { keepCache = false, previous = null } = options;
    const cacheSource =
      keepCache && previous && previous.profileCache instanceof Map
        ? previous.profileCache
        : new Map();
    return {
      isOpen: false,
      editable: false,
      ownerUid: null,
      members: new Map(),
      pendingChanges: false,
      isLoadingMembers: false,
      isSearching: false,
      searchTerm: "",
      searchResults: [],
      searchError: "",
      errorMessage: "",
      isSaving: false,
      profileCache: cacheSource,
      searchDebounce: null,
      lastFocusedElement: null,
    };
  }



  const relativeTime = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const state = {
    userId: null,
    userEmail: null,
    displayName: null,
    profile: null,
    activeAuthView: "login",
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
    share: createShareState(),
  };

  const imageResizeState = {
    pointerId: null,
    wrapper: null,
    img: null,
    handle: null,
    handleDirection: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    editorWidth: 0,
    hasChanges: false,
    savedSelection: null,
  };
  const imageCropState = {
    isActive: false,
    pointerId: null,
    wrapper: null,
    img: null,
    overlay: null,
    rect: null,
    startX: 0,
    startY: 0,
    lastRect: null,
    savedSelection: null,
  };
  let isImageResizeActive = false;
  let activeImageWrapper = null;

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
    authTabs: Array.from(document.querySelectorAll(".auth-tab")),
    authViews: Array.from(document.querySelectorAll(".auth-view")),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
    resetForm: document.getElementById("reset-form"),
    loginError: document.getElementById("login-error"),
    registerError: document.getElementById("register-error"),
    resetError: document.getElementById("reset-error"),
    resetSuccess: document.getElementById("reset-success"),
    currentUser: document.getElementById("current-user"),
    logoutBtn: document.getElementById("logout-btn"),
    headerMenuBtn: document.getElementById("workspace-menu-btn"),
    headerMenu: document.getElementById("workspace-menu"),
    addNoteBtn: document.getElementById("add-note-btn"),
    mobileAddNoteBtn: document.getElementById("mobile-add-note-btn"),
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
    shareButton: document.getElementById("share-note-btn"),
    shareDialog: document.getElementById("share-dialog"),
    shareDialogClose: document.getElementById("share-dialog-close"),
    shareDialogBackdrop: document.getElementById("share-dialog-backdrop"),
    shareForm: document.getElementById("share-form"),
    shareMembersList: document.getElementById("share-members-list"),
    shareMembersEmpty: document.getElementById("share-members-empty"),
    shareRestriction: document.getElementById("share-restriction"),
    shareSearchInput: document.getElementById("share-search-input"),
    shareSearchResults: document.getElementById("share-search-results"),
    shareSearchStatus: document.getElementById("share-search-status"),
    shareSearchEmpty: document.getElementById("share-search-empty"),
    shareDialogError: document.getElementById("share-dialog-error"),
    shareSaveBtn: document.getElementById("share-dialog-save"),
    shareCancelBtn: document.getElementById("share-dialog-cancel"),
  };

  if (ui.mobileAddNoteBtn && ui.addNoteBtn) {
    const referenceLabel =
      ui.addNoteBtn.getAttribute("aria-label")?.trim() ||
      ui.addNoteBtn.textContent?.trim() ||
      "";

    if (referenceLabel) {
      ui.mobileAddNoteBtn.setAttribute("aria-label", referenceLabel);
    } else {
      ui.mobileAddNoteBtn.removeAttribute("aria-label");
    }
  }

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

  function updateShareButtonState() {
    if (!ui.shareButton) {
      return;
    }
    const hasNote = Boolean(state.currentNoteId && state.currentNote);
    const ownerUid = hasNote
      ? (typeof state.currentNote.ownerUid === "string" && state.currentNote.ownerUid.trim())
        || state.userId
        || null
      : null;
    const isOwner = Boolean(hasNote && ownerUid && ownerUid === state.userId);
    ui.shareButton.disabled = !hasNote;
    ui.shareButton.classList.toggle("share-button-readonly", Boolean(hasNote && !isOwner));
    const title = !hasNote
      ? "Ouvrez une fiche pour partager."
      : isOwner
        ? "Partager cette fiche"
        : "Seul le propriétaire peut modifier le partage.";
    ui.shareButton.setAttribute("title", title);
    ui.shareButton.setAttribute("aria-label", hasNote ? "Partager cette fiche" : "Partager indisponible");
    ui.shareButton.setAttribute("aria-expanded", state.share.isOpen ? "true" : "false");
  }

  function resetShareState(options = {}) {
    const { keepCache = true } = options;
    const previous = state.share;
    state.share = createShareState({ keepCache, previous });
    return previous;
  }

  function getCachedShareProfile(uid, fallback = {}) {
    if (!uid) {
      return null;
    }
    if (!(state.share.profileCache instanceof Map)) {
      state.share.profileCache = new Map();
    }
    const existing = state.share.profileCache.get(uid);
    if (existing) {
      const merged = normalizeShareProfile(uid, existing, fallback);
      state.share.profileCache.set(uid, merged);
      return merged;
    }
    const normalized = normalizeShareProfile(uid, {}, fallback);
    state.share.profileCache.set(uid, normalized);
    return normalized;
  }

  async function ensureShareProfile(uid, fallback = {}) {
    if (!uid) {
      return null;
    }
    if (!(state.share.profileCache instanceof Map)) {
      state.share.profileCache = new Map();
    }
    let data = null;
    try {
      const profileSnap = await getDoc(doc(db, "profiles", uid));
      if (profileSnap.exists()) {
        data = profileSnap.data() || {};
      }
    } catch (error) {
      console.warn("Impossible de charger le profil", error);
    }
    const existing = state.share.profileCache.get(uid) || {};
    const normalized = normalizeShareProfile(uid, data || existing, fallback);
    state.share.profileCache.set(uid, normalized);
    return normalized;
  }

  function getShareProfileMeta(profile) {
    if (!profile) {
      return "";
    }
    if (profile.email && profile.email !== profile.displayName) {
      return profile.email;
    }
    if (profile.pseudo && profile.pseudo !== profile.displayName) {
      return profile.pseudo;
    }
    return "";
  }

  function createOwnerListItem(profile) {
    const item = document.createElement("li");
    item.className = "share-member";
    item.dataset.memberId = profile?.uid || "";

    const info = document.createElement("div");
    info.className = "share-member__info";
    const name = document.createElement("span");
    name.className = "share-member__name";
    name.textContent = profile?.displayName || profile?.uid || "Utilisateur";
    info.appendChild(name);
    const metaText = getShareProfileMeta(profile);
    if (metaText) {
      const meta = document.createElement("span");
      meta.className = "share-member__meta";
      meta.textContent = metaText;
      info.appendChild(meta);
    }

    const actions = document.createElement("div");
    actions.className = "share-member__actions";
    const badge = document.createElement("span");
    badge.className = "share-owner-badge";
    badge.textContent = "Propriétaire";
    actions.appendChild(badge);

    item.appendChild(info);
    item.appendChild(actions);
    return item;
  }

  function createMemberListItem(profile, role, options = {}) {
    const { editable = false, disableControls = false } = options;
    const resolved = profile || { uid: "", displayName: "Utilisateur" };
    const item = document.createElement("li");
    item.className = "share-member";
    item.dataset.memberId = resolved.uid;

    const info = document.createElement("div");
    info.className = "share-member__info";
    const name = document.createElement("span");
    name.className = "share-member__name";
    name.textContent = resolved.displayName || resolved.uid || "Utilisateur";
    info.appendChild(name);
    const metaText = getShareProfileMeta(resolved);
    if (metaText) {
      const meta = document.createElement("span");
      meta.className = "share-member__meta";
      meta.textContent = metaText;
      info.appendChild(meta);
    }

    const actions = document.createElement("div");
    actions.className = "share-member__actions";
    const roleContainer = document.createElement("div");
    roleContainer.className = "share-member__role";
    const label = document.createElement("label");
    label.className = "sr-only";
    const safeUid = typeof resolved.uid === "string" ? resolved.uid.replace(/[^a-zA-Z0-9_-]/g, "-") : "member";
    const selectId = `share-role-${safeUid}`;
    label.setAttribute("for", selectId);
    label.textContent = `Rôle pour ${resolved.displayName || resolved.uid}`;
    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.memberId = resolved.uid;
    select.dataset.shareRoleSelect = "1";
    [SHARE_ROLE_VIEWER, SHARE_ROLE_EDITOR].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = SHARE_ROLE_LABELS[value] || value;
      select.appendChild(option);
    });
    select.value = normalizeShareRole(role);
    select.disabled = !editable || disableControls;
    roleContainer.appendChild(label);
    roleContainer.appendChild(select);
    actions.appendChild(roleContainer);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "share-remove-btn";
    removeBtn.textContent = "Retirer";
    removeBtn.dataset.memberId = resolved.uid;
    removeBtn.dataset.shareAction = "remove";
    removeBtn.disabled = !editable || disableControls;
    removeBtn.setAttribute(
      "aria-label",
      `Retirer ${resolved.displayName || resolved.uid} de la liste des membres`
    );
    actions.appendChild(removeBtn);

    item.appendChild(info);
    item.appendChild(actions);
    return item;
  }

  function renderShareDialog() {
    updateShareButtonState();
    if (!ui.shareDialog || !ui.shareDialogBackdrop) {
      return;
    }
    const share = state.share;
    const isOpen = Boolean(share?.isOpen);

    if (!isOpen) {
      ui.shareDialog.classList.add("hidden");
      ui.shareDialogBackdrop.classList.add("hidden");
      ui.shareDialog.setAttribute("aria-hidden", "true");
      ui.shareDialogBackdrop.setAttribute("aria-hidden", "true");
      document.body.classList.remove("share-dialog-open");
      if (ui.shareDialogError) {
        ui.shareDialogError.textContent = "";
        ui.shareDialogError.classList.add("hidden");
      }
      if (ui.shareSearchStatus) {
        ui.shareSearchStatus.textContent = "";
      }
      if (ui.shareSearchResults) {
        ui.shareSearchResults.innerHTML = "";
      }
      if (ui.shareMembersList) {
        ui.shareMembersList.innerHTML = "";
      }
      if (ui.shareMembersEmpty) {
        ui.shareMembersEmpty.classList.add("hidden");
      }
      if (ui.shareSearchEmpty) {
        ui.shareSearchEmpty.classList.add("hidden");
      }
      if (ui.shareSearchInput && ui.shareSearchInput.value !== "") {
        ui.shareSearchInput.value = "";
      }
      if (ui.shareSaveBtn) {
        ui.shareSaveBtn.disabled = true;
        ui.shareSaveBtn.textContent = "Enregistrer";
      }
      if (ui.shareCancelBtn) {
        ui.shareCancelBtn.disabled = false;
      }
      return;
    }

    ui.shareDialog.classList.remove("hidden");
    ui.shareDialogBackdrop.classList.remove("hidden");
    ui.shareDialog.setAttribute("aria-hidden", "false");
    ui.shareDialogBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("share-dialog-open");

    const editable = Boolean(share.editable);
    const controlsDisabled = share.isSaving || share.isLoadingMembers;

    if (ui.shareRestriction) {
      if (!editable) {
        ui.shareRestriction.textContent = "Seul le propriétaire peut modifier le partage.";
        ui.shareRestriction.classList.remove("hidden");
      } else if (share.isLoadingMembers) {
        ui.shareRestriction.textContent = "Chargement des membres…";
        ui.shareRestriction.classList.remove("hidden");
      } else {
        ui.shareRestriction.textContent = "";
        ui.shareRestriction.classList.add("hidden");
      }
    }

    if (ui.shareDialogError) {
      if (share.errorMessage) {
        ui.shareDialogError.textContent = share.errorMessage;
        ui.shareDialogError.classList.remove("hidden");
      } else {
        ui.shareDialogError.textContent = "";
        ui.shareDialogError.classList.add("hidden");
      }
    }

    if (ui.shareSearchInput) {
      if (ui.shareSearchInput.value !== share.searchTerm) {
        ui.shareSearchInput.value = share.searchTerm;
      }
      ui.shareSearchInput.disabled = !editable || share.isSaving;
    }

    if (ui.shareSaveBtn) {
      ui.shareSaveBtn.disabled = !editable || share.isSaving || !share.pendingChanges;
      ui.shareSaveBtn.textContent = share.isSaving ? "Enregistrement…" : "Enregistrer";
    }

    if (ui.shareCancelBtn) {
      ui.shareCancelBtn.disabled = share.isSaving;
    }

    if (ui.shareMembersList) {
      ui.shareMembersList.innerHTML = "";
      const fragment = document.createDocumentFragment();
      if (share.ownerUid) {
        const ownerProfile = getCachedShareProfile(share.ownerUid, {
          displayName: share.ownerUid === state.userId ? state.displayName : "",
          email: share.ownerUid === state.userId ? state.userEmail : "",
        });
        fragment.appendChild(createOwnerListItem(ownerProfile));
      }
      share.members.forEach((memberRole, memberId) => {
        const profile = getCachedShareProfile(memberId) || { uid: memberId, displayName: memberId };
        fragment.appendChild(
          createMemberListItem(profile, memberRole, {
            editable,
            disableControls: controlsDisabled,
          })
        );
      });
      ui.shareMembersList.appendChild(fragment);
    }

    if (ui.shareMembersEmpty) {
      const showEmpty = share.members.size === 0 && !share.isLoadingMembers;
      ui.shareMembersEmpty.textContent = "Aucun collaborateur n'a encore été ajouté.";
      ui.shareMembersEmpty.classList.toggle("hidden", !showEmpty);
    }

    if (ui.shareSearchResults) {
      ui.shareSearchResults.innerHTML = "";
      if (share.searchResults.length > 0) {
        const fragment = document.createDocumentFragment();
        share.searchResults.forEach((profile) => {
          if (!profile || profile.uid === share.ownerUid) {
            return;
          }
          const item = document.createElement("li");
          item.className = "share-search-item";
          item.dataset.memberId = profile.uid;

          const info = document.createElement("div");
          info.className = "share-search-item__info";
          const name = document.createElement("span");
          name.className = "share-search-item__name";
          name.textContent = profile.displayName || profile.uid;
          info.appendChild(name);
          const metaText = getShareProfileMeta(profile);
          if (metaText) {
            const meta = document.createElement("span");
            meta.className = "share-search-item__meta";
            meta.textContent = metaText;
            info.appendChild(meta);
          }
          item.appendChild(info);

          const alreadyMember = share.members.has(profile.uid);
          if (alreadyMember) {
            const status = document.createElement("span");
            status.className = "share-search-item__status";
            status.textContent = "Déjà ajouté";
            item.appendChild(status);
          } else {
            const addBtn = document.createElement("button");
            addBtn.type = "button";
            addBtn.className = "share-search-add secondary";
            addBtn.textContent = "Ajouter";
            addBtn.dataset.memberId = profile.uid;
            addBtn.dataset.shareAction = "add";
            addBtn.disabled = !editable || share.isSaving;
            addBtn.setAttribute(
              "aria-label",
              `Ajouter ${profile.displayName || profile.uid} en tant que lecteur`
            );
            item.appendChild(addBtn);
          }

          fragment.appendChild(item);
        });
        ui.shareSearchResults.appendChild(fragment);
      }
    }

    if (ui.shareSearchEmpty) {
      const shouldShowEmpty =
        share.searchTerm.trim().length > 0 &&
        !share.isSearching &&
        share.searchResults.length === 0 &&
        !share.searchError;
      ui.shareSearchEmpty.classList.toggle("hidden", !shouldShowEmpty);
    }

    if (ui.shareSearchStatus) {
      let statusMessage = "";
      if (share.isSearching) {
        statusMessage = "Recherche en cours…";
      } else if (share.searchError) {
        statusMessage = share.searchError;
      } else if (share.searchTerm.trim()) {
        statusMessage = `Résultats pour "${share.searchTerm.trim()}"`;
      }
      ui.shareSearchStatus.textContent = statusMessage;
    }
  }

  function closeShareDialog() {
    if (!state.share.isOpen) {
      return;
    }
    if (state.share.searchDebounce) {
      clearTimeout(state.share.searchDebounce);
      state.share.searchDebounce = null;
    }
    const previous = resetShareState({ keepCache: true });
    renderShareDialog();
    const focusTarget =
      previous?.lastFocusedElement instanceof HTMLElement
        ? previous.lastFocusedElement
        : ui.shareButton;
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus({ preventScroll: true });
    }
  }

  async function openShareDialog() {
    if (!ui.shareButton || ui.shareButton.disabled || !state.currentNoteId || !state.currentNote) {
      return;
    }
    if (state.share.isOpen) {
      return;
    }
    try {
      await flushPendingSave();
    } catch (error) {
      console.warn("Impossible de synchroniser la fiche avant l'ouverture du partage", error);
    }

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : ui.shareButton;
    const nextShareState = createShareState({ keepCache: true, previous: state.share });
    const ownerUid =
      (typeof state.currentNote.ownerUid === "string" && state.currentNote.ownerUid.trim()) || state.userId;
    nextShareState.isOpen = true;
    nextShareState.lastFocusedElement = previousFocus;
    nextShareState.ownerUid = ownerUid || null;
    nextShareState.editable = Boolean(!ownerUid || ownerUid === state.userId);
    nextShareState.members = new Map(
      Object.entries(sanitizeMembersRecord(state.currentNote.members)).filter(([uid]) => uid !== ownerUid)
    );
    nextShareState.errorMessage = "";
    nextShareState.pendingChanges = false;
    nextShareState.isLoadingMembers = true;
    state.share = nextShareState;

    const ownerFallback = {
      displayName: ownerUid === state.userId ? state.displayName : "",
      email: ownerUid === state.userId ? state.userEmail : "",
    };
    getCachedShareProfile(ownerUid, ownerFallback);

    renderShareDialog();

    const memberIds = Array.from(nextShareState.members.keys());
    try {
      await Promise.all([
        ensureShareProfile(ownerUid, ownerFallback),
        ...memberIds.map((uid) => ensureShareProfile(uid)),
      ]);
    } finally {
      if (!state.share.isOpen || state.share !== nextShareState) {
        return;
      }
      nextShareState.isLoadingMembers = false;
      renderShareDialog();
      const focusTarget =
        nextShareState.editable && ui.shareSearchInput ? ui.shareSearchInput : ui.shareDialogClose;
      if (focusTarget) {
        setTimeout(() => {
          if (state.share.isOpen) {
            focusTarget.focus({ preventScroll: true });
          }
        }, 60);
      }
    }
  }

  function handleShareSearchInput(event) {
    if (!state.share.isOpen || !state.share.editable || state.share.isSaving) {
      return;
    }
    const value = typeof event.target.value === "string" ? event.target.value : "";
    state.share.searchTerm = value;
    state.share.searchError = "";
    if (state.share.searchDebounce) {
      clearTimeout(state.share.searchDebounce);
      state.share.searchDebounce = null;
    }
    if (!value.trim()) {
      state.share.searchResults = [];
      renderShareDialog();
      return;
    }
    state.share.searchDebounce = setTimeout(() => {
      state.share.searchDebounce = null;
      performShareSearch(value.trim());
    }, SHARE_SEARCH_DEBOUNCE_MS);
    renderShareDialog();
  }

  async function performShareSearch(term) {
    const share = state.share;
    const currentTerm = term.trim();
    if (!share.isOpen || !share.editable || !currentTerm) {
      share.searchResults = [];
      share.searchError = "";
      share.isSearching = false;
      renderShareDialog();
      return;
    }
    const ownerUid = share.ownerUid;
    const profilesRef = collection(db, "profiles");
    const lowerTerm = currentTerm.toLowerCase();
    share.isSearching = true;
    share.searchError = "";
    renderShareDialog();

    const resultsMap = new Map();
    try {
      if (currentTerm.includes("@")) {
        try {
          const emailQuery = query(profilesRef, where("email", "==", currentTerm));
          const emailSnap = await getDocs(emailQuery);
          emailSnap.forEach((docSnap) => {
            resultsMap.set(docSnap.id, docSnap.data() || {});
          });
        } catch (error) {
          console.warn("Recherche exacte par e-mail impossible", error);
        }
      }

      try {
        const pseudoQuery = query(
          profilesRef,
          orderBy("pseudo"),
          startAt(currentTerm),
          endAt(`${currentTerm}\uf8ff`),
          limit(10)
        );
        const pseudoSnap = await getDocs(pseudoQuery);
        pseudoSnap.forEach((docSnap) => {
          resultsMap.set(docSnap.id, docSnap.data() || {});
        });
      } catch (error) {
        console.warn("Recherche par pseudo préfixe impossible, tentative d'alternative", error);
        try {
          const fallbackSnap = await getDocs(query(profilesRef, limit(20)));
          fallbackSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const pseudo = typeof data.pseudo === "string" ? data.pseudo.toLowerCase() : "";
            const email = typeof data.email === "string" ? data.email.toLowerCase() : "";
            if ((pseudo && pseudo.includes(lowerTerm)) || (email && email.includes(lowerTerm))) {
              resultsMap.set(docSnap.id, data);
            }
          });
        } catch (fallbackError) {
          console.warn("Recherche de secours impossible", fallbackError);
        }
      }
    } catch (error) {
      console.error("Erreur lors de la recherche de profils", error);
      share.searchError = "Recherche impossible pour le moment. Veuillez réessayer.";
    }

    share.isSearching = false;
    if (share.searchTerm.trim() !== currentTerm) {
      renderShareDialog();
      return;
    }

    const formatted = Array.from(resultsMap.entries()).reduce((acc, [uid, data]) => {
      if (uid === ownerUid) {
        return acc;
      }
      const normalized = normalizeShareProfile(uid, data);
      state.share.profileCache.set(uid, normalized);
      acc.push(normalized);
      return acc;
    }, []);
    formatted.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" }));
    share.searchResults = formatted;
    renderShareDialog();
  }

  function handleShareAdd(memberId) {
    if (!state.share.isOpen || !state.share.editable || state.share.isSaving) {
      return;
    }
    if (!memberId || memberId === state.share.ownerUid) {
      return;
    }
    if (!state.share.members) {
      state.share.members = new Map();
    }
    if (state.share.members.has(memberId)) {
      return;
    }
    state.share.members.set(memberId, SHARE_ROLE_VIEWER);
    state.share.pendingChanges = true;
    state.share.errorMessage = "";
    state.share.searchResults = state.share.searchResults.filter((profile) => profile.uid !== memberId);
    renderShareDialog();
  }

  function handleShareRemove(memberId) {
    if (!state.share.isOpen || !state.share.editable || state.share.isSaving) {
      return;
    }
    if (!memberId || !state.share.members?.has(memberId)) {
      return;
    }
    state.share.members.delete(memberId);
    state.share.pendingChanges = true;
    state.share.errorMessage = "";
    renderShareDialog();
  }

  function handleShareDialogClick(event) {
    if (!state.share.isOpen) {
      return;
    }
    const removeBtn = closestElement(event.target, '[data-share-action="remove"]');
    if (removeBtn) {
      event.preventDefault();
      handleShareRemove(removeBtn.dataset.memberId || "");
      return;
    }
    const addBtn = closestElement(event.target, '[data-share-action="add"]');
    if (addBtn) {
      event.preventDefault();
      handleShareAdd(addBtn.dataset.memberId || "");
    }
  }

  function handleShareDialogChange(event) {
    if (!state.share.isOpen || !state.share.editable || state.share.isSaving) {
      return;
    }
    const select = closestElement(event.target, "[data-share-role-select]");
    if (!select || !(select instanceof HTMLSelectElement)) {
      return;
    }
    const memberId = select.dataset.memberId || "";
    if (!memberId || !state.share.members?.has(memberId)) {
      return;
    }
    const nextRole = normalizeShareRole(select.value);
    state.share.members.set(memberId, nextRole);
    state.share.pendingChanges = true;
    state.share.errorMessage = "";
    renderShareDialog();
  }

  async function saveShareChanges(event) {
    event.preventDefault();
    if (!state.share.isOpen) {
      return;
    }
    if (!state.share.editable) {
      closeShareDialog();
      return;
    }
    if (!state.share.pendingChanges) {
      closeShareDialog();
      return;
    }
    if (!state.userId || !state.currentNoteId) {
      state.share.errorMessage = "Aucune fiche active sélectionnée.";
      renderShareDialog();
      return;
    }
    state.share.isSaving = true;
    state.share.errorMessage = "";
    renderShareDialog();
    try {
      await flushPendingSave();
    } catch (error) {
      console.warn("Impossible de synchroniser la fiche avant l'enregistrement du partage", error);
    }

    const noteRef = doc(db, "users", state.userId, "notes", state.currentNoteId);
    const resolvedMembers = [];
    for (const [memberId, memberRole] of state.share.members.entries()) {
      const normalizedRole = normalizeShareRole(memberRole);
      const cachedProfile = getCachedShareProfile(memberId);
      const email =
        typeof cachedProfile?.email === "string" ? cachedProfile.email.trim() : "";
      if (email) {
        try {
          const result = await shareNoteByEmail(noteRef, email, normalizedRole);
          resolvedMembers.push([result.uid, result.role]);
          continue;
        } catch (shareError) {
          console.error("Impossible de partager la fiche via l'e-mail fourni", shareError);
          state.share.isSaving = false;
          state.share.errorMessage =
            shareError instanceof Error && shareError.message
              ? shareError.message
              : "Impossible d'ajouter ce membre par e-mail.";
          renderShareDialog();
          return;
        }
      }
      resolvedMembers.push([memberId, normalizedRole]);
    }
    const membersPayload = Object.fromEntries(resolvedMembers);
    state.share.members = new Map(resolvedMembers);

    try {
      await updateDoc(noteRef, {
        members: membersPayload,
        updatedAt: serverTimestamp(),
      });
      const now = new Date();
      state.currentNote.members = { ...membersPayload };
      state.currentNote.updatedAt = now;
      state.lastSavedAt = now;
      updateLocalNoteCache(state.currentNoteId, {
        members: { ...membersPayload },
        updatedAt: now,
      });
      state.share.pendingChanges = false;
      state.share.isSaving = false;
      showToast("Partage mis à jour", "success");
      closeShareDialog();
    } catch (error) {
      state.share.isSaving = false;
      if (isPermissionDenied(error)) {
        reportPermissionIssue("Modification du partage refusée par Firestore");
        state.share.errorMessage = "Vous n'avez pas la permission de modifier le partage de cette fiche.";
      } else {
        console.error("Impossible d'enregistrer les modifications de partage", error);
        state.share.errorMessage = "Impossible d'enregistrer les modifications de partage.";
      }
      renderShareDialog();
    }
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
      if (state.share.isOpen) {
        closeShareDialog();
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
      "Règles Firestore insuffisantes. Déployez le fichier firestore.rules dans votre projet et vérifiez la configuration d'authentification.";
    const fullMessage = context ? `${context} : ${hint}` : hint;
    console.error(fullMessage);
    showToast("Permissions Firestore insuffisantes. Consultez la console pour les étapes.", "error");
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
      .querySelectorAll(
        ".editor-image__handle, .editor-image__selection, .editor-image__crop-overlay"
      )
      .forEach((element) => element.remove());
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
        ui.saveStatus.textContent = date ? `Enregistré à ${dateFormatter.format(date)}` : "Enregistré";
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

  function applyImageDimensions(wrapper, img, widthPx, heightPx) {
    if (!wrapper || !img) return { width: 0, height: 0 };

    const rect = img.getBoundingClientRect();
    const naturalRatio =
      img.naturalWidth > 0 && img.naturalHeight > 0
        ? img.naturalHeight / img.naturalWidth
        : rect.width > 0 && rect.height > 0
          ? rect.height / rect.width
          : null;

    const hasWidthArg = Number.isFinite(widthPx);
    const hasHeightArg = Number.isFinite(heightPx);

    let resolvedWidth = hasWidthArg ? Number(widthPx) : parseFloat(img.style.width);
    if (!Number.isFinite(resolvedWidth) || resolvedWidth <= 0) {
      resolvedWidth = rect.width || img.naturalWidth || IMAGE_RESIZE_MIN_WIDTH;
    }
    resolvedWidth = Math.max(IMAGE_RESIZE_MIN_WIDTH, resolvedWidth);
    const roundedWidth = Math.round(resolvedWidth);
    img.style.width = `${roundedWidth}px`;
    wrapper.dataset.width = img.style.width;
    wrapper.dataset.widthPx = String(roundedWidth);

    let resolvedHeight = hasHeightArg ? Number(heightPx) : parseFloat(img.style.height);
    if (!Number.isFinite(resolvedHeight) || resolvedHeight <= 0) {
      if (hasHeightArg) {
        resolvedHeight = rect.height || img.naturalHeight || IMAGE_RESIZE_MIN_HEIGHT;
      } else if (rect.height > 0) {
        resolvedHeight = rect.height;
      } else if (naturalRatio) {
        resolvedHeight = roundedWidth * naturalRatio;
      } else if (img.naturalHeight > 0) {
        resolvedHeight = img.naturalHeight;
      } else {
        resolvedHeight = IMAGE_RESIZE_MIN_HEIGHT;
      }
    }
    if (hasHeightArg) {
      resolvedHeight = Math.max(IMAGE_RESIZE_MIN_HEIGHT, resolvedHeight);
      const roundedHeight = Math.round(resolvedHeight);
      img.style.height = `${roundedHeight}px`;
    }
    if (img.style.height) {
      const numericHeight = parseFloat(img.style.height);
      if (Number.isFinite(numericHeight)) {
        wrapper.dataset.height = img.style.height;
        wrapper.dataset.heightPx = String(Math.round(Math.max(numericHeight, IMAGE_RESIZE_MIN_HEIGHT)));
        resolvedHeight = numericHeight;
      } else {
        delete wrapper.dataset.height;
        delete wrapper.dataset.heightPx;
      }
    } else {
      delete wrapper.dataset.height;
      delete wrapper.dataset.heightPx;
    }

    const editorWidth = getEditorContentWidth();
    if (editorWidth > 0) {
      const percent = Math.round((roundedWidth / editorWidth) * 100);
      const clampedPercent = Math.max(1, Math.min(100, percent));
      wrapper.dataset.widthPercent = String(clampedPercent);
    } else {
      delete wrapper.dataset.widthPercent;
    }

    return { width: roundedWidth, height: Math.round(resolvedHeight) };
  }

  function updateImageHandleAccessibility(wrapper, img) {
    if (!wrapper || !img) return;
    const handles = Array.from(wrapper.querySelectorAll('.editor-image__handle'));
    if (!handles.length) return;

    const rect = img.getBoundingClientRect();
    const width = Math.round(rect.width || parseFloat(img.style.width) || 0);
    const height = Math.round(rect.height || parseFloat(img.style.height) || 0);
    const editorWidth = getEditorContentWidth();
    const widthPercent = editorWidth > 0 && width > 0 ? Math.round((width / editorWidth) * 100) : null;

    handles.forEach((handle) => {
      const direction = handle.dataset.handle || '';
      const controlsWidth = direction.includes('e') || direction.includes('w');
      const controlsHeight = direction.includes('n') || direction.includes('s');
      const controlsBoth = controlsWidth && controlsHeight;

      if (controlsHeight && !controlsWidth) {
        handle.setAttribute('aria-orientation', 'vertical');
      } else {
        handle.setAttribute('aria-orientation', 'horizontal');
      }

      const parts = [];
      if (width > 0) {
        if (widthPercent !== null) {
          const clampedPercent = Math.max(1, Math.min(100, widthPercent));
          parts.push(`${width} px (${clampedPercent} % largeur)`);
        } else {
          parts.push(`${width} px de largeur`);
        }
      }
      if (controlsHeight || controlsBoth) {
        if (height > 0) {
          parts.push(`${height} px de hauteur`);
        }
      }

      let label = "Redimensionner l'image";
      if (controlsBoth) {
        label = "Redimensionner la largeur et la hauteur de l'image";
      } else if (controlsWidth) {
        label = "Redimensionner la largeur de l'image";
      } else if (controlsHeight) {
        label = "Redimensionner la hauteur de l'image";
      }
      if (parts.length) {
        const text = `${label} (${parts.join(' · ')})`;
        handle.setAttribute('aria-label', text);
        handle.setAttribute('title', text);
        handle.setAttribute('aria-valuetext', parts.join(' · '));
      } else {
        handle.setAttribute('aria-label', label);
        handle.setAttribute('title', label);
        handle.removeAttribute('aria-valuetext');
      }

      if (controlsHeight && !controlsWidth) {
        handle.setAttribute('aria-valuemin', String(IMAGE_RESIZE_MIN_HEIGHT));
        if (height > 0) {
          handle.setAttribute('aria-valuemax', String(Math.max(height, IMAGE_RESIZE_MIN_HEIGHT)));
          handle.setAttribute('aria-valuenow', String(height));
        } else {
          handle.removeAttribute('aria-valuemax');
          handle.removeAttribute('aria-valuenow');
        }
      } else {
        const minValue = editorWidth > 0 ? 1 : IMAGE_RESIZE_MIN_WIDTH;
        handle.setAttribute('aria-valuemin', String(minValue));
        if (widthPercent !== null) {
          const clampedPercent = Math.max(1, Math.min(100, widthPercent));
          handle.setAttribute('aria-valuemax', '100');
          handle.setAttribute('aria-valuenow', String(clampedPercent));
        } else if (width > 0) {
          handle.setAttribute('aria-valuemax', String(Math.max(width, IMAGE_RESIZE_MIN_WIDTH)));
          handle.setAttribute('aria-valuenow', String(width));
        } else {
          handle.removeAttribute('aria-valuemax');
          handle.removeAttribute('aria-valuenow');
        }
      }
    });
  }

  function ensureImageSelectionElements(wrapper, img) {
    if (!wrapper || !img) return null;
    let selection = wrapper.querySelector('.editor-image__selection');
    if (!selection) {
      selection = document.createElement('span');
      selection.className = 'editor-image__selection';
      selection.dataset.editorImageSelection = 'true';
      selection.setAttribute('contenteditable', 'false');
      selection.setAttribute('aria-hidden', 'true');
      wrapper.appendChild(selection);
    }

    IMAGE_HANDLE_DIRECTIONS.forEach((direction) => {
      let handle = selection.querySelector(`.editor-image__handle[data-handle="${direction}"]`);
      if (!handle) {
        handle = document.createElement('span');
        handle.className = `editor-image__handle editor-image__handle--${direction}`;
        handle.dataset.handle = direction;
        handle.dataset.editorImageHandle = 'true';
        handle.tabIndex = 0;
        handle.setAttribute('role', 'slider');
        handle.setAttribute('contenteditable', 'false');
        handle.setAttribute('draggable', 'false');
        selection.appendChild(handle);
      }
    });

    updateImageHandleAccessibility(wrapper, img);
    return selection;
  }

  function ensureCropOverlay(wrapper) {
    if (!wrapper) return null;
    let overlay = wrapper.querySelector('.editor-image__crop-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'editor-image__crop-overlay';
      overlay.setAttribute('data-editor-image-crop-overlay', 'true');
      overlay.setAttribute('hidden', 'hidden');
      overlay.tabIndex = -1;

      const rect = document.createElement('div');
      rect.className = 'editor-image__crop-rect';
      rect.setAttribute('hidden', 'hidden');
      overlay.appendChild(rect);

      const instructions = document.createElement('div');
      instructions.className = 'editor-image__crop-instructions';
      instructions.textContent = 'Glissez pour définir la zone à conserver. Entrée pour valider, Échap pour annuler.';
      overlay.appendChild(instructions);

      overlay.addEventListener('pointerdown', handleImageCropPointerDown);
      overlay.addEventListener('pointermove', handleImageCropPointerMove);
      overlay.addEventListener('pointerup', handleImageCropPointerUp);
      overlay.addEventListener('pointercancel', handleImageCropPointerCancel);
    }
    return overlay;
  }

  function unwrapEditorImage(wrapper) {
    if (!wrapper || !wrapper.parentNode) return;
    if (activeImageWrapper === wrapper) {
      activeImageWrapper = null;
    }
    while (wrapper.firstChild) {
      wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }

  function selectEditorImage(wrapper) {
    if (!wrapper) return;
    if (activeImageWrapper && activeImageWrapper !== wrapper) {
      activeImageWrapper.classList.remove('editor-image--selected');
    }
    activeImageWrapper = wrapper;
    wrapper.classList.add('editor-image--selected');
    const img = wrapper.querySelector('img');
    if (img) {
      ensureImageSelectionElements(wrapper, img);
      updateImageHandleAccessibility(wrapper, img);
    }
  }

  function deselectEditorImage() {
    if (imageCropState.isActive) {
      exitImageCropMode({ cancel: true });
    }
    if (activeImageWrapper) {
      activeImageWrapper.classList.remove('editor-image--selected');
    }
    activeImageWrapper = null;
  }

  function resetImageResizeState() {
    imageResizeState.pointerId = null;
    imageResizeState.wrapper = null;
    imageResizeState.img = null;
    imageResizeState.handle = null;
    imageResizeState.handleDirection = null;
    imageResizeState.startX = 0;
    imageResizeState.startY = 0;
    imageResizeState.startWidth = 0;
    imageResizeState.startHeight = 0;
    imageResizeState.editorWidth = 0;
    imageResizeState.hasChanges = false;
    imageResizeState.savedSelection = null;
    isImageResizeActive = false;
  }

  function resetImageCropState() {
    imageCropState.isActive = false;
    imageCropState.pointerId = null;
    imageCropState.wrapper = null;
    imageCropState.img = null;
    imageCropState.overlay = null;
    imageCropState.rect = null;
    imageCropState.startX = 0;
    imageCropState.startY = 0;
    imageCropState.lastRect = null;
    imageCropState.savedSelection = null;
  }

  function exitImageCropMode(options = {}) {
    const { cancel = false } = options;
    if (!imageCropState.isActive) {
      resetImageCropState();
      return;
    }
    const { overlay, wrapper, rect, pointerId } = imageCropState;
    if (overlay) {
      overlay.removeAttribute('data-active');
      overlay.setAttribute('hidden', 'hidden');
      if (typeof overlay.releasePointerCapture === 'function' && pointerId !== null) {
        try {
          overlay.releasePointerCapture(pointerId);
        } catch (error) {}
      }
      overlay.classList.remove('is-dragging');
    }
    if (rect) {
      rect.setAttribute('hidden', 'hidden');
      rect.style.width = '0px';
      rect.style.height = '0px';
    }
    if (wrapper) {
      wrapper.classList.remove('editor-image--cropping');
    }
    const savedSelection = imageCropState.savedSelection
      ? { ...imageCropState.savedSelection }
      : null;
    resetImageCropState();
    if (cancel && savedSelection) {
      state.savedSelection = savedSelection;
    }
  }

  function enterImageCropMode(wrapper, img) {
    if (!wrapper || !img) return;
    if (imageCropState.isActive && imageCropState.wrapper === wrapper) {
      return;
    }
    if (imageCropState.isActive) {
      exitImageCropMode({ cancel: true });
    }

    const overlay = ensureCropOverlay(wrapper);
    if (!overlay) return;
    const rectElement = overlay.querySelector('.editor-image__crop-rect');

    overlay.removeAttribute('hidden');
    overlay.dataset.active = 'true';
    wrapper.classList.add('editor-image--cropping');
    selectEditorImage(wrapper);

    imageCropState.isActive = true;
    imageCropState.pointerId = null;
    imageCropState.wrapper = wrapper;
    imageCropState.img = img;
    imageCropState.overlay = overlay;
    imageCropState.rect = rectElement;
    imageCropState.startX = 0;
    imageCropState.startY = 0;
    imageCropState.lastRect = null;
    imageCropState.savedSelection = state.savedSelection ? { ...state.savedSelection } : null;

    if (rectElement) {
      rectElement.setAttribute('hidden', 'hidden');
      rectElement.style.width = '0px';
      rectElement.style.height = '0px';
    }

    if (typeof overlay.focus === 'function') {
      overlay.focus({ preventScroll: true });
    }
  }

  function updateCropPreview(rectElement, overlay, img, rect) {
    if (!rectElement || !overlay || !img || !rect) return;
    const currentSrc = img.currentSrc || img.src || '';
    rectElement.removeAttribute('hidden');
    rectElement.style.left = `${rect.left}px`;
    rectElement.style.top = `${rect.top}px`;
    rectElement.style.width = `${rect.width}px`;
    rectElement.style.height = `${rect.height}px`;
    if (currentSrc) {
      rectElement.style.backgroundImage = `url("${currentSrc}")`;
      rectElement.style.backgroundSize = `${overlay.clientWidth}px ${overlay.clientHeight}px`;
      rectElement.style.backgroundPosition = `-${rect.left}px -${rect.top}px`;
    } else {
      rectElement.style.backgroundImage = 'none';
    }
  }

  function applyCropFromState() {
    const { wrapper, img, overlay, lastRect } = imageCropState;
    if (!wrapper || !img || !overlay || !lastRect) {
      return false;
    }
    if (lastRect.width < IMAGE_CROP_MIN_SIZE || lastRect.height < IMAGE_CROP_MIN_SIZE) {
      return false;
    }
    if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
      showToast('Image non encore chargée pour le rognage.', 'warning');
      return false;
    }
    const overlayRect = overlay.getBoundingClientRect();
    if (!overlayRect || overlayRect.width <= 0 || overlayRect.height <= 0) {
      return false;
    }
    const scaleX = img.naturalWidth / overlayRect.width;
    const scaleY = img.naturalHeight / overlayRect.height;
    const cropX = Math.max(0, Math.round(lastRect.left * scaleX));
    const cropY = Math.max(0, Math.round(lastRect.top * scaleY));
    const cropWidth = Math.max(1, Math.round(lastRect.width * scaleX));
    const cropHeight = Math.max(1, Math.round(lastRect.height * scaleY));

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return false;
    }

    context.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl) {
      return false;
    }

    img.src = dataUrl;
    applyImageDimensions(wrapper, img, lastRect.width, lastRect.height);
    updateImageHandleAccessibility(wrapper, img);
    enhanceEditorImages();
    handleEditorInput({ bypassReadOnly: true });

    const savedSelection = imageCropState.savedSelection
      ? { ...imageCropState.savedSelection }
      : null;
    if (savedSelection) {
      state.savedSelection = savedSelection;
    }
    selectEditorImage(wrapper);
    return true;
  }

  function handleImageCropPointerDown(event) {
    if (!(event instanceof PointerEvent)) return;
    if (!imageCropState.isActive) return;
    const overlay = imageCropState.overlay;
    if (!overlay || event.currentTarget !== overlay) return;
    if (typeof event.button === 'number' && event.button !== 0) return;

    const overlayRect = overlay.getBoundingClientRect();
    const localX = Math.max(0, Math.min(overlayRect.width, event.clientX - overlayRect.left));
    const localY = Math.max(0, Math.min(overlayRect.height, event.clientY - overlayRect.top));

    imageCropState.pointerId = event.pointerId;
    imageCropState.startX = localX;
    imageCropState.startY = localY;
    imageCropState.lastRect = { left: localX, top: localY, width: 0, height: 0 };

    overlay.classList.add('is-dragging');
    event.preventDefault();
    if (typeof overlay.setPointerCapture === 'function') {
      try {
        overlay.setPointerCapture(event.pointerId);
      } catch (error) {}
    }
  }

  function handleImageCropPointerMove(event) {
    if (!(event instanceof PointerEvent)) return;
    if (!imageCropState.isActive) return;
    if (imageCropState.pointerId === null || event.pointerId !== imageCropState.pointerId) {
      return;
    }
    const overlay = imageCropState.overlay;
    const rectElement = imageCropState.rect;
    const img = imageCropState.img;
    if (!overlay || !rectElement || !img) return;

    const overlayRect = overlay.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(overlayRect.width, event.clientX - overlayRect.left));
    const currentY = Math.max(0, Math.min(overlayRect.height, event.clientY - overlayRect.top));

    const left = Math.min(imageCropState.startX, currentX);
    const top = Math.min(imageCropState.startY, currentY);
    const width = Math.abs(currentX - imageCropState.startX);
    const height = Math.abs(currentY - imageCropState.startY);

    const previewRect = { left, top, width, height };
    imageCropState.lastRect = previewRect;
    updateCropPreview(rectElement, overlay, img, previewRect);
  }

  function handleImageCropPointerUp(event) {
    if (!(event instanceof PointerEvent)) return;
    if (!imageCropState.isActive) return;
    if (imageCropState.pointerId === null || event.pointerId !== imageCropState.pointerId) {
      return;
    }

    const overlay = imageCropState.overlay;
    if (overlay) {
      overlay.classList.remove('is-dragging');
      if (typeof overlay.releasePointerCapture === 'function') {
        try {
          overlay.releasePointerCapture(event.pointerId);
        } catch (error) {}
      }
    }
    event.preventDefault();

    const applied = applyCropFromState();
    exitImageCropMode({ cancel: !applied });
  }

  function handleImageCropPointerCancel(event) {
    if (!(event instanceof PointerEvent)) return;
    if (imageCropState.pointerId === null || event.pointerId !== imageCropState.pointerId) {
      return;
    }
    const overlay = imageCropState.overlay;
    if (overlay) {
      overlay.classList.remove('is-dragging');
      if (typeof overlay.releasePointerCapture === 'function') {
        try {
          overlay.releasePointerCapture(event.pointerId);
        } catch (error) {}
      }
    }
    exitImageCropMode({ cancel: true });
  }

  function handleImageCropKeyDown(event) {
    if (!imageCropState.isActive) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      exitImageCropMode({ cancel: true });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const applied = applyCropFromState();
      exitImageCropMode({ cancel: !applied });
    }
  }

  function enhanceEditorImages() {
    if (!ui.noteEditor) return;

    const wrappers = Array.from(ui.noteEditor.querySelectorAll('.editor-image'));
    wrappers.forEach((wrapper) => {
      const img = wrapper.querySelector('img');
      if (!img) {
        if (imageCropState.wrapper === wrapper) {
          exitImageCropMode({ cancel: true });
        }
        unwrapEditorImage(wrapper);
      }
    });

    const images = Array.from(ui.noteEditor.querySelectorAll('img'));
    const editorWidth = getEditorContentWidth();

    images.forEach((img) => {
      if (!(img instanceof HTMLImageElement)) {
        return;
      }
      let wrapper = img.parentElement;
      if (!wrapper || !wrapper.classList || !wrapper.classList.contains('editor-image')) {
        wrapper = document.createElement('span');
        wrapper.className = 'editor-image';
        if (img.parentNode) {
          img.parentNode.insertBefore(wrapper, img);
        }
        wrapper.appendChild(img);
      }

      const currentWidthStyle = (img.style.width || '').trim();
      const currentHeightStyle = (img.style.height || '').trim();
      const isPercentWidth = currentWidthStyle.endsWith('%');

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
        const numericHeight = Number.isFinite(parseFloat(currentHeightStyle))
          ? parseFloat(currentHeightStyle)
          : undefined;
        applyImageDimensions(wrapper, img, baseWidth, numericHeight);
      } else {
        const numericWidth = parseFloat(currentWidthStyle);
        const numericHeight = Number.isFinite(parseFloat(currentHeightStyle))
          ? parseFloat(currentHeightStyle)
          : undefined;
        if (Number.isFinite(numericWidth)) {
          applyImageDimensions(wrapper, img, numericWidth, numericHeight);
        } else {
          wrapper.dataset.width = currentWidthStyle;
        }
      }

      ensureImageSelectionElements(wrapper, img);

      if (!img.dataset.editorImageEnhanceListener) {
        img.addEventListener('load', () => {
          requestAnimationFrame(() => enhanceEditorImages());
        });
        img.dataset.editorImageEnhanceListener = 'true';
      }
    });

    if (activeImageWrapper && !ui.noteEditor.contains(activeImageWrapper)) {
      activeImageWrapper = null;
    }
  }

  function handleImageHandlePointerDown(event) {
    if (!(event instanceof PointerEvent)) return;
    const target = event.target instanceof Element ? event.target : null;
    const handle = target ? target.closest('.editor-image__handle') : null;
    if (handle) {
      if (typeof event.button === 'number' && event.button !== 0) return;
      if (typeof event.isPrimary === 'boolean' && !event.isPrimary) return;

      const wrapper = handle.closest('.editor-image');
      const img = wrapper ? wrapper.querySelector('img') : null;
      if (!wrapper || !img) return;

      selectEditorImage(wrapper);
      if (imageCropState.isActive && imageCropState.wrapper !== wrapper) {
        exitImageCropMode({ cancel: true });
      }

      rememberEditorSelection();
      imageResizeState.savedSelection = state.savedSelection
        ? { ...state.savedSelection }
        : null;
      isImageResizeActive = true;

      event.preventDefault();
      event.stopPropagation();

      const rect = img.getBoundingClientRect();
      const styleWidth = parseFloat(img.style.width);
      const styleHeight = parseFloat(img.style.height);
      const fallbackWidth = Number.isFinite(styleWidth) && styleWidth > 0 ? styleWidth : IMAGE_RESIZE_MIN_WIDTH;
      const fallbackHeight = Number.isFinite(styleHeight) && styleHeight > 0 ? styleHeight : IMAGE_RESIZE_MIN_HEIGHT;

      imageResizeState.pointerId = event.pointerId;
      imageResizeState.wrapper = wrapper;
      imageResizeState.img = img;
      imageResizeState.handle = handle;
      imageResizeState.handleDirection = handle.dataset.handle || null;
      imageResizeState.startX = event.clientX;
      imageResizeState.startY = event.clientY;
      imageResizeState.startWidth = rect.width > 0 ? rect.width : fallbackWidth;
      imageResizeState.startHeight = rect.height > 0 ? rect.height : fallbackHeight;
      imageResizeState.editorWidth = getEditorContentWidth();
      imageResizeState.hasChanges = false;

      wrapper.classList.add('editor-image--resizing');
      if (typeof handle.setPointerCapture === 'function') {
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (error) {}
      }
      if (typeof handle.focus === 'function') {
        handle.focus({ preventScroll: true });
      }
      return;
    }

    const wrapper = target ? target.closest('.editor-image') : null;
    const img = wrapper ? wrapper.querySelector('img') : null;
    if (wrapper && img) {
      selectEditorImage(wrapper);
      return;
    }

    if (!closestElement(target, '.editor-image__crop-overlay')) {
      deselectEditorImage();
    }
  }

  function handleImageHandlePointerMove(event) {
    if (!(event instanceof PointerEvent)) return;
    if (imageResizeState.pointerId === null || event.pointerId !== imageResizeState.pointerId) {
      return;
    }
    const { img, wrapper, handleDirection, startX, startY, startWidth, startHeight } = imageResizeState;
    if (!img || !wrapper || !handleDirection) {
      return;
    }

    event.preventDefault();

    const rect = img.getBoundingClientRect();
    const naturalWidth = Number.isFinite(img.naturalWidth) ? img.naturalWidth : 0;
    const naturalHeight = Number.isFinite(img.naturalHeight) ? img.naturalHeight : 0;
    let aspectRatio =
      naturalWidth > 0 && naturalHeight > 0
        ? naturalWidth / naturalHeight
        : rect.width > 0 && rect.height > 0
          ? rect.width / rect.height
          : startWidth > 0 && startHeight > 0
            ? startWidth / startHeight
            : 1;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      aspectRatio = 1;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const controlsHorizontal = handleDirection.includes('e') || handleDirection.includes('w');
    const controlsVertical = handleDirection.includes('n') || handleDirection.includes('s');
    if (!controlsHorizontal && !controlsVertical) {
      return;
    }

    let tentativeWidth = startWidth;
    let tentativeHeight = startHeight;

    if (controlsHorizontal) {
      if (handleDirection.includes('e')) {
        tentativeWidth = startWidth + deltaX;
      } else if (handleDirection.includes('w')) {
        tentativeWidth = startWidth - deltaX;
      }
    }
    if (controlsVertical) {
      if (handleDirection.includes('s')) {
        tentativeHeight = startHeight + deltaY;
      } else if (handleDirection.includes('n')) {
        tentativeHeight = startHeight - deltaY;
      }
    }

    const minWidth = IMAGE_RESIZE_MIN_WIDTH;
    const minHeight = IMAGE_RESIZE_MIN_HEIGHT;
    const editorWidth = getEditorContentWidth();
    const maxWidth = editorWidth > 0 ? Math.max(editorWidth, minWidth) : Math.max(startWidth, minWidth);
    const baseHeight = img.naturalHeight || startHeight || minHeight;
    const maxHeight = Math.max(baseHeight, startHeight, minHeight) * 3;

    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    const resolveFromWidth = (widthValue) => {
      let widthMinBound = minWidth;
      let widthMaxBound = maxWidth;

      const widthFromMinHeight = minHeight * aspectRatio;
      if (Number.isFinite(widthFromMinHeight) && widthFromMinHeight > 0) {
        widthMinBound = Math.max(widthMinBound, widthFromMinHeight);
      }

      const widthFromMaxHeight = maxHeight * aspectRatio;
      if (Number.isFinite(widthFromMaxHeight) && widthFromMaxHeight > 0) {
        widthMaxBound = Math.min(widthMaxBound, widthFromMaxHeight);
      }

      let resolvedWidth = Number.isFinite(widthValue) ? widthValue : startWidth;
      if (!Number.isFinite(resolvedWidth) || resolvedWidth <= 0) {
        resolvedWidth = startWidth > 0 ? startWidth : widthMinBound;
      }
      if (!Number.isFinite(resolvedWidth) || resolvedWidth <= 0) {
        resolvedWidth = widthMinBound > 0 ? widthMinBound : minWidth;
      }

      if (widthMinBound > widthMaxBound) {
        const candidateMin = clamp(widthMinBound, minWidth, maxWidth);
        const candidateMax = clamp(widthMaxBound, minWidth, maxWidth);
        const distanceToMin = Math.abs(resolvedWidth - candidateMin);
        const distanceToMax = Math.abs(resolvedWidth - candidateMax);
        resolvedWidth = distanceToMin <= distanceToMax ? candidateMin : candidateMax;
      } else {
        resolvedWidth = clamp(resolvedWidth, widthMinBound, widthMaxBound);
      }

      let resolvedHeight = resolvedWidth / aspectRatio;
      if (!Number.isFinite(resolvedHeight) || resolvedHeight <= 0) {
        resolvedHeight = startHeight > 0 ? startHeight : minHeight;
      }

      if (resolvedHeight < minHeight) {
        resolvedHeight = minHeight;
        resolvedWidth = clamp(resolvedHeight * aspectRatio, minWidth, maxWidth);
        resolvedHeight = resolvedWidth / aspectRatio;
      } else if (resolvedHeight > maxHeight) {
        resolvedHeight = maxHeight;
        resolvedWidth = clamp(resolvedHeight * aspectRatio, minWidth, maxWidth);
        resolvedHeight = resolvedWidth / aspectRatio;
      }

      if (!Number.isFinite(resolvedWidth) || resolvedWidth <= 0) {
        resolvedWidth = minWidth;
        resolvedHeight = resolvedWidth / aspectRatio;
      }
      if (!Number.isFinite(resolvedHeight) || resolvedHeight <= 0) {
        resolvedHeight = minHeight;
        resolvedWidth = resolvedHeight * aspectRatio;
      }

      return { width: resolvedWidth, height: resolvedHeight };
    };

    const useWidthReference = controlsHorizontal && (!controlsVertical || Math.abs(tentativeWidth - startWidth) >= Math.abs(tentativeHeight - startHeight));
    const widthInput = useWidthReference ? tentativeWidth : tentativeHeight * aspectRatio;
    const { width: targetWidth, height: targetHeight } = resolveFromWidth(widthInput);

    const previousWidth = parseFloat(img.style.width);
    const previousHeight = parseFloat(img.style.height);

    const appliedDimensions = applyImageDimensions(wrapper, img, targetWidth, targetHeight);
    updateImageHandleAccessibility(wrapper, img);

    const widthChanged = !Number.isFinite(previousWidth) || Math.round(previousWidth) !== appliedDimensions.width;
    const heightChanged = !Number.isFinite(previousHeight) || Math.round(previousHeight) !== appliedDimensions.height;
    if (widthChanged || heightChanged) {
      imageResizeState.hasChanges = true;
    }
  }

  function handleImageHandlePointerUp(event) {
    if (!(event instanceof PointerEvent)) return;
    if (imageResizeState.pointerId === null || event.pointerId !== imageResizeState.pointerId) {
      return;
    }
    const { handle, wrapper, img, hasChanges } = imageResizeState;
    const savedSelection = imageResizeState.savedSelection
      ? { ...imageResizeState.savedSelection }
      : null;

    event.preventDefault();

    if (handle && typeof handle.releasePointerCapture === 'function') {
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch (error) {}
    }
    if (wrapper) {
      wrapper.classList.remove('editor-image--resizing');
    }
    if (wrapper && img) {
      updateImageHandleAccessibility(wrapper, img);
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
    if (!(event instanceof PointerEvent)) return;
    if (imageResizeState.pointerId === null || event.pointerId !== imageResizeState.pointerId) {
      return;
    }
    const { handle, wrapper, img } = imageResizeState;
    const savedSelection = imageResizeState.savedSelection
      ? { ...imageResizeState.savedSelection }
      : null;
    if (handle && typeof handle.releasePointerCapture === 'function') {
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch (error) {}
    }
    if (wrapper) {
      wrapper.classList.remove('editor-image--resizing');
    }
    if (wrapper && img) {
      updateImageHandleAccessibility(wrapper, img);
    }
    resetImageResizeState();
    if (savedSelection) {
      state.savedSelection = savedSelection;
    }
  }

  function handleImageHandleKeyDown(event) {
    if (!(event instanceof KeyboardEvent)) return;
    const target = event.target instanceof Element ? event.target.closest('.editor-image__handle') : null;
    if (!target) return;

    const wrapper = target.closest('.editor-image');
    const img = wrapper ? wrapper.querySelector('img') : null;
    if (!wrapper || !img) return;

    const direction = target.dataset.handle || '';
    const savedSelection = state.savedSelection ? { ...state.savedSelection } : null;

    if (event.key === 'c' || event.key === 'C' || event.key === 'Enter') {
      event.preventDefault();
      selectEditorImage(wrapper);
      enterImageCropMode(wrapper, img);
      return;
    }

    let step = event.shiftKey ? IMAGE_RESIZE_KEYBOARD_STEP_LARGE : IMAGE_RESIZE_KEYBOARD_STEP;
    let widthDelta = 0;
    let heightDelta = 0;

    if (event.key === 'ArrowLeft') {
      if (direction.includes('e')) {
        widthDelta = -step;
      } else if (direction.includes('w')) {
        widthDelta = step;
      }
    } else if (event.key === 'ArrowRight') {
      if (direction.includes('e')) {
        widthDelta = step;
      } else if (direction.includes('w')) {
        widthDelta = -step;
      }
    } else if (event.key === 'ArrowUp') {
      if (direction.includes('s')) {
        heightDelta = -step;
      } else if (direction.includes('n')) {
        heightDelta = step;
      }
    } else if (event.key === 'ArrowDown') {
      if (direction.includes('s')) {
        heightDelta = step;
      } else if (direction.includes('n')) {
        heightDelta = -step;
      }
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = img.getBoundingClientRect();
    const currentWidth = rect.width || parseFloat(img.style.width) || IMAGE_RESIZE_MIN_WIDTH;
    const currentHeight = rect.height || parseFloat(img.style.height) || IMAGE_RESIZE_MIN_HEIGHT;

    const tentativeWidth = currentWidth + widthDelta;
    const tentativeHeight = currentHeight + heightDelta;

    const minWidth = IMAGE_RESIZE_MIN_WIDTH;
    const minHeight = IMAGE_RESIZE_MIN_HEIGHT;
    const editorWidth = getEditorContentWidth();
    const maxWidth = editorWidth > 0 ? Math.max(editorWidth, minWidth) : Math.max(currentWidth, minWidth);
    const baseHeight = img.naturalHeight || currentHeight || minHeight;
    const maxHeight = Math.max(baseHeight, currentHeight, minHeight) * 3;

    const clampedWidth = Math.max(minWidth, Math.min(tentativeWidth, maxWidth));
    const clampedHeight = Math.max(minHeight, Math.min(tentativeHeight, maxHeight));

    const widthArg = direction.includes('e') || direction.includes('w') ? clampedWidth : undefined;
    const heightArg = direction.includes('n') || direction.includes('s') ? clampedHeight : undefined;

    applyImageDimensions(wrapper, img, widthArg, heightArg);
    updateImageHandleAccessibility(wrapper, img);
    enhanceEditorImages();
    handleEditorInput({ bypassReadOnly: true });
    if (savedSelection) {
      state.savedSelection = savedSelection;
    }
  }

  function handleDocumentPointerDownForImages(event) {
    if (!activeImageWrapper) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (activeImageWrapper.contains(target)) {
      return;
    }
    if (closestElement(target, '.editor-image')) {
      return;
    }
    if (closestElement(target, '.editor-image__crop-overlay')) {
      return;
    }
    deselectEditorImage();
  }

  function handleEditorImageDoubleClick(event) {
    const wrapper = closestElement(event.target, '.editor-image');
    if (!wrapper) return;
    const img = wrapper.querySelector('img');
    if (!img) return;
    event.preventDefault();
    selectEditorImage(wrapper);
    enterImageCropMode(wrapper, img);
  }
  function showEmptyEditor() {
    setRevisionMode(false);
    hideClozeFeedback();
    deselectEditorImage();
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
    updateShareButtonState();
  }

  function applyCurrentNoteToEditor(options = {}) {
    const { force = false } = options;
    if (!state.currentNote) {
      showEmptyEditor();
      return;
    }
    hideClozeFeedback();
    deselectEditorImage();
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
    if (state.share.isOpen && !state.share.pendingChanges) {
      const ownerUid =
        (typeof state.currentNote.ownerUid === "string" && state.currentNote.ownerUid.trim()) || state.userId;
      state.share.ownerUid = ownerUid || null;
      state.share.editable = Boolean(!ownerUid || ownerUid === state.userId);
      const nextMembers = sanitizeMembersRecord(state.currentNote.members);
      state.share.members = new Map(
        Object.entries(nextMembers).filter(([uid]) => uid !== ownerUid)
      );
      state.share.errorMessage = "";
      renderShareDialog();
    } else {
      updateShareButtonState();
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
    row.classList.add(hasChildren ? "note-row--has-toggle" : "note-row--no-toggle");
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

      const createdAt = toDate(data.createdAt);
      const updatedAt = toDate(data.updatedAt) || createdAt;
      const ownerUid =
        typeof data.ownerUid === "string" && data.ownerUid.trim() !== ""
          ? data.ownerUid.trim()
          : null;
      const members = sanitizeMembersRecord(data.members);
      const published =
        typeof data.published === "boolean"
          ? data.published
          : typeof data.published === "string"
            ? data.published.toLowerCase() === "true"
            : typeof data.published === "number"
              ? data.published !== 0
              : false;

      return {
        id: docSnap.id,
        title: data.title || "",
        contentHtml: data.contentHtml || "",
        createdAt,
        updatedAt,
        ownerUid,
        members,
        published,
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
    if (state.share.isOpen) {
      closeShareDialog();
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
    if (!state.currentNote || !state.userId || !state.currentNoteId) return;
    if (!state.hasUnsavedChanges) return;
    updateSaveStatus("saving");
    const noteRef = doc(db, "users", state.userId, "notes", state.currentNoteId);
    const payload = {
      title: (state.currentNote.title || "").trim(),
      contentHtml: sanitizeHtml(state.currentNote.contentHtml || ""),
      updatedAt: serverTimestamp(),
      ownerUid: state.userId,
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
    if (!state.userId) return;
    const safeParentId = typeof parentId === "string" && parentId.trim() !== "" ? parentId.trim() : null;
    try {
      const notesRef = collection(db, "users", state.userId, "notes");
      const timestamp = serverTimestamp();
      const payload = {
        title: "Nouvelle fiche",
        contentHtml: "",
        ownerUid: state.userId,
        members: {},
        published: false,
        createdAt: timestamp,
        updatedAt: timestamp,
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
    if (!state.userId || !noteId) return;
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
        await deleteDoc(doc(db, "users", state.userId, "notes", id));
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

  function setFormPending(form, pending) {
    if (!form) {
      return;
    }
    const elements = Array.from(
      form.querySelectorAll("input, button, select, textarea")
    );
    elements.forEach((element) => {
      element.disabled = pending;
    });
  }

  function setAuthMessage(element, message) {
    if (!element) {
      return;
    }
    if (message && message.trim()) {
      element.textContent = message;
      element.classList.remove("hidden");
    } else {
      element.textContent = "";
      element.classList.add("hidden");
    }
  }

  function clearAuthMessages() {
    setAuthMessage(ui.loginError, "");
    setAuthMessage(ui.registerError, "");
    setAuthMessage(ui.resetError, "");
    setAuthMessage(ui.resetSuccess, "");
  }

  function showAuthView(viewName = "login") {
    const target = viewName || "login";
    state.activeAuthView = target;
    clearAuthMessages();
    ui.authViews.forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const view = element.dataset.authView;
      const isActive = view === target;
      element.classList.toggle("hidden", !isActive);
      element.setAttribute("aria-hidden", String(!isActive));
      if (isActive) {
        const focusTarget = element.querySelector(
          "input:not([type='hidden']):not([disabled])"
        );
        if (focusTarget && typeof focusTarget.focus === "function") {
          focusTarget.focus();
        }
      }
    });
    ui.authTabs.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const view = button.getAttribute("data-auth-view-target");
      const isActive = view === target;
      button.classList.toggle("active", isActive);
      if (isActive) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }

  function getAuthErrorMessage(error, context) {
    const code = typeof error?.code === "string" ? error.code : "";
    switch (code) {
      case "auth/invalid-email":
        return "Adresse e-mail invalide.";
      case "auth/email-already-in-use":
        return "Cette adresse e-mail est déjà utilisée.";
      case "auth/weak-password":
        return "Mot de passe trop faible (6 caractères minimum).";
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "E-mail ou mot de passe incorrect.";
      case "auth/too-many-requests":
        return "Trop de tentatives. Réessayez dans quelques instants.";
      case "auth/network-request-failed":
        return "Connexion impossible. Vérifiez votre réseau.";
      default:
        break;
    }
    switch (context) {
      case "register":
        return "Inscription impossible pour le moment. Veuillez réessayer.";
      case "login":
        return "Connexion impossible pour le moment. Veuillez réessayer.";
      case "reset":
        return "Envoi impossible pour le moment. Veuillez réessayer.";
      default:
        return "Une erreur inattendue est survenue.";
    }
  }

  async function handleRegisterSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : ui.registerForm;
    if (!form) {
      return;
    }
    const formData = new FormData(form);
    const email = (formData.get("email") || "").toString().trim();
    const password = (formData.get("password") || "").toString();
    const pseudoRaw = (formData.get("pseudo") || "").toString();
    const pseudo = pseudoRaw.trim();
    setAuthMessage(ui.registerError, "");
    if (!email || !password) {
      setAuthMessage(ui.registerError, "Veuillez renseigner un e-mail et un mot de passe.");
      return;
    }
    setFormPending(form, true);
    try {
      const credential = await signUp(auth, email, password);
      const user = credential.user;
      if (user?.uid) {
        const profileRef = doc(db, "profiles", user.uid);
        const payload = {
          pseudo: pseudo ? pseudo : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        try {
          await setDoc(profileRef, payload);
        } catch (profileError) {
          console.warn("Impossible d'enregistrer le pseudo", profileError);
        }
      }
    } catch (error) {
      console.error("Erreur lors de l'inscription", error);
      setAuthMessage(ui.registerError, getAuthErrorMessage(error, "register"));
    } finally {
      setFormPending(form, false);
    }
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : ui.loginForm;
    if (!form) {
      return;
    }
    const formData = new FormData(form);
    const email = (formData.get("email") || "").toString().trim();
    const password = (formData.get("password") || "").toString();
    setAuthMessage(ui.loginError, "");
    if (!email || !password) {
      setAuthMessage(ui.loginError, "Veuillez renseigner votre e-mail et votre mot de passe.");
      return;
    }
    setFormPending(form, true);
    try {
      await signIn(auth, email, password);
    } catch (error) {
      console.error("Erreur lors de la connexion", error);
      setAuthMessage(ui.loginError, getAuthErrorMessage(error, "login"));
    } finally {
      setFormPending(form, false);
    }
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : ui.resetForm;
    if (!form) {
      return;
    }
    const formData = new FormData(form);
    const email = (formData.get("email") || "").toString().trim();
    setAuthMessage(ui.resetError, "");
    setAuthMessage(ui.resetSuccess, "");
    if (!email) {
      setAuthMessage(ui.resetError, "Veuillez renseigner votre adresse e-mail.");
      return;
    }
    setFormPending(form, true);
    try {
      await resetPassword(auth, email);
      setAuthMessage(
        ui.resetSuccess,
        "Un e-mail de réinitialisation vient d'être envoyé si le compte existe."
      );
      form.reset();
    } catch (error) {
      console.error("Erreur lors de la réinitialisation du mot de passe", error);
      setAuthMessage(ui.resetError, getAuthErrorMessage(error, "reset"));
    } finally {
      setFormPending(form, false);
    }
  }

  function subscribeToNotes() {
    if (!state.userId) return;
    const ref = collection(db, "users", state.userId, "notes");
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

  function resetState() {
    if (state.notesUnsubscribe) {
      state.notesUnsubscribe();
      state.notesUnsubscribe = null;
    }
    if (state.pendingSave) {
      clearTimeout(state.pendingSave);
      state.pendingSave = null;
    }
    resetShareState({ keepCache: false });
    state.userId = null;
    state.userEmail = null;
    state.displayName = null;
    state.profile = null;
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
    renderShareDialog();
    ui.currentUser.textContent = "";
    ui.logoutBtn.disabled = true;
  }

  async function handleAuthState(user) {
    resetState();
    if (!user) {
      if (ui.loginForm) {
        ui.loginForm.reset();
      }
      if (ui.registerForm) {
        ui.registerForm.reset();
      }
      if (ui.resetForm) {
        ui.resetForm.reset();
      }
      showView("login");
      showAuthView("login");
      return;
    }

    state.userId = user.uid;
    state.userEmail = typeof user.email === "string" ? user.email : "";

    let profileData = null;
    try {
      const profileSnap = await getDoc(doc(db, "profiles", user.uid));
      if (profileSnap.exists()) {
        profileData = profileSnap.data() || {};
      }
    } catch (error) {
      console.warn("Impossible de charger le profil utilisateur", error);
    }

    state.profile = profileData || {};
    const pseudo =
      typeof profileData?.pseudo === "string" && profileData.pseudo.trim()
        ? profileData.pseudo.trim()
        : "";
    const identityParts = [];
    if (pseudo) {
      identityParts.push(pseudo);
    }
    if (state.userEmail) {
      identityParts.push(state.userEmail);
    }
    const identityLabel = identityParts.length
      ? `Connecté en tant que ${identityParts.join(" · ")}`
      : "Connecté";
    ui.currentUser.textContent = identityLabel;
    state.displayName = pseudo || state.userEmail || "Utilisateur";
    ui.logoutBtn.disabled = false;
    if (ui.loginForm) {
      ui.loginForm.reset();
    }
    if (ui.registerForm) {
      ui.registerForm.reset();
    }
    if (ui.resetForm) {
      ui.resetForm.reset();
    }
    clearAuthMessages();
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
    if (ui.authTabs.length) {
      ui.authTabs.forEach((button) => {
        button.addEventListener("click", () => {
          const target = button.getAttribute("data-auth-view-target");
          if (target) {
            showAuthView(target);
          }
        });
      });
    }
    if (ui.loginForm) {
      ui.loginForm.addEventListener("submit", handleLoginSubmit);
    }
    if (ui.registerForm) {
      ui.registerForm.addEventListener("submit", handleRegisterSubmit);
    }
    if (ui.resetForm) {
      ui.resetForm.addEventListener("submit", handleResetSubmit);
    }
    ui.logoutBtn.addEventListener("click", logout);
    ui.addNoteBtn.addEventListener("click", () => {
      createNote().catch((error) => {
        console.error(error);
      });
    });
    if (ui.mobileAddNoteBtn) {
      ui.mobileAddNoteBtn.addEventListener("click", () => {
        try {
          Promise.resolve(createNote())
            .catch((error) => {
              console.error(error);
            })
            .finally(() => {
              setNotesDrawer(false);
            });
        } catch (error) {
          console.error(error);
          setNotesDrawer(false);
        }
      });
    }
    ui.noteTitle.addEventListener("input", handleTitleInput);
    ui.noteEditor.addEventListener("input", handleEditorInput);
    ui.noteEditor.addEventListener("click", handleEditorClick);
    ui.noteEditor.addEventListener("scroll", hideClozeFeedback);
    ui.noteEditor.addEventListener("focus", handleEditorFocus);
    ui.noteEditor.addEventListener("pointerdown", handleImageHandlePointerDown);
    ui.noteEditor.addEventListener("keydown", handleImageHandleKeyDown);
    ui.noteEditor.addEventListener("dblclick", handleEditorImageDoubleClick);
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
    if (ui.shareButton) {
      ui.shareButton.addEventListener("click", () => {
        Promise.resolve(openShareDialog()).catch((error) => {
          console.error("Impossible d'ouvrir le partage", error);
          showToast("Impossible d'ouvrir le partage", "error");
        });
      });
    }
    if (ui.shareDialogClose) {
      ui.shareDialogClose.addEventListener("click", () => closeShareDialog());
    }
    if (ui.shareDialogBackdrop) {
      ui.shareDialogBackdrop.addEventListener("click", () => closeShareDialog());
    }
    if (ui.shareCancelBtn) {
      ui.shareCancelBtn.addEventListener("click", (event) => {
        event.preventDefault();
        closeShareDialog();
      });
    }
    if (ui.shareForm) {
      ui.shareForm.addEventListener("submit", saveShareChanges);
    }
    if (ui.shareDialog) {
      ui.shareDialog.addEventListener("click", handleShareDialogClick);
      ui.shareDialog.addEventListener("change", handleShareDialogChange);
    }
    if (ui.shareSearchInput) {
      ui.shareSearchInput.addEventListener("input", handleShareSearchInput);
    }
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("pointerdown", handleDocumentPointerDownForImages);
    document.addEventListener("keydown", handleImageCropKeyDown);
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

  showAuthView(state.activeAuthView);
  initEvents();
  updateShareButtonState();
  updateToolbarFormattingLayout();
  if (typeof mobileMediaQuery.addEventListener === "function") {
    mobileMediaQuery.addEventListener("change", updateToolbarFormattingLayout);
  } else if (typeof mobileMediaQuery.addListener === "function") {
    mobileMediaQuery.addListener(updateToolbarFormattingLayout);
  }
  initAuth();
}
