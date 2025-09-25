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

  const DASHBOARD_DEFAULT_PERIOD = 10;
  const DASHBOARD_RESPONSE_MAP = {
    yes: { label: "Oui", className: "dashboard-response--yes", score: 5 },
    "rather-yes": {
      label: "Plutôt oui",
      className: "dashboard-response--rather-yes",
      score: 4
    },
    neutral: { label: "Neutre", className: "dashboard-response--neutral", score: 3 },
    "rather-no": {
      label: "Plutôt non",
      className: "dashboard-response--rather-no",
      score: 2
    },
    no: { label: "Non", className: "dashboard-response--no", score: 1 }
  };
  const DASHBOARD_LINE_COLORS = [
    "#2563eb",
    "#7c3aed",
    "#059669",
    "#d97706",
    "#dc2626",
    "#0ea5e9",
    "#9333ea"
  ];
  const DASHBOARD_SAMPLE_DATA = {
    iterations: Array.from({ length: 16 }, (_, index) => index + 1),
    consignes: [
      {
        id: "consigne-1",
        label: "Présenter la notion centrale",
        responses: {
          16: "yes",
          15: "rather-yes",
          14: "yes",
          13: "neutral",
          12: "yes",
          11: "yes",
          10: "rather-yes",
          9: "neutral",
          8: "yes",
          7: "yes",
          6: "rather-yes",
          5: "neutral",
          4: "yes",
          3: "rather-yes",
          2: "neutral",
          1: "rather-no"
        }
      },
      {
        id: "consigne-2",
        label: "Donner un exemple concret",
        responses: {
          16: "rather-yes",
          15: "rather-yes",
          14: "neutral",
          13: "rather-yes",
          12: "yes",
          11: "yes",
          10: "neutral",
          9: "neutral",
          8: "rather-yes",
          7: "neutral",
          6: "rather-no",
          5: "rather-no",
          4: "neutral",
          3: "rather-no",
          2: "rather-no",
          1: "no"
        }
      },
      {
        id: "consigne-3",
        label: "Décrire la procédure étape par étape",
        responses: {
          16: "yes",
          15: "yes",
          14: "rather-yes",
          13: "rather-yes",
          12: "neutral",
          11: "rather-yes",
          10: "rather-yes",
          9: "neutral",
          8: "rather-no",
          7: "neutral",
          6: "neutral",
          5: "rather-no",
          4: "rather-no",
          3: "neutral",
          2: "no",
          1: "no"
        }
      },
      {
        id: "consigne-4",
        label: "Identifier les erreurs fréquentes",
        responses: {
          16: "neutral",
          15: "neutral",
          14: "rather-no",
          13: "rather-no",
          12: "rather-no",
          11: "neutral",
          10: "rather-yes",
          9: "neutral",
          8: "neutral",
          7: "rather-yes",
          6: "rather-yes",
          5: "neutral",
          4: "neutral",
          3: "rather-no",
          2: "rather-no",
          1: "no"
        }
      },
      {
        id: "consigne-5",
        label: "Synthétiser le point clé",
        responses: {
          16: "yes",
          15: "yes",
          14: "yes",
          13: "rather-yes",
          12: "rather-yes",
          11: "neutral",
          10: "rather-yes",
          9: "rather-yes",
          8: "neutral",
          7: "neutral",
          6: "rather-no",
          5: "rather-no",
          4: "neutral",
          3: "rather-yes",
          2: "rather-yes",
          1: "neutral"
        }
      }
    ]
  };

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
    notesUnsubscribe: null,
    notes: [],
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
    savedSelection: null,
    [CLOZE_MANUAL_REVEAL_SET_KEY]: new WeakSet(),
    dashboard: null
  };

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
    dashboardPanel: document.getElementById("dashboard-panel"),
    dashboardPeriodButtons: Array.from(
      document.querySelectorAll("[data-dashboard-period]") || []
    ),
    dashboardTableHead: document.getElementById("dashboard-table-head"),
    dashboardTableBody: document.getElementById("dashboard-table-body"),
    dashboardChart: document.getElementById("dashboard-chart"),
    dashboardLegend: document.getElementById("dashboard-legend")
  };

  const workspaceLayout = document.querySelector(".workspace");
  const bodyElement = document.body;
  const rootElement = document.documentElement;
  const headerElement = document.querySelector(".app-header");

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
  window.addEventListener("orientationchange", updateToolbarOffsets, { passive: true });

  const SCROLL_COLLAPSE_THRESHOLD = 24;

  function updateHeaderCollapseState() {
    if (!bodyElement) {
      return;
    }

    if (window.scrollY > SCROLL_COLLAPSE_THRESHOLD) {
      bodyElement.classList.add("header-collapsed");
    } else {
      bodyElement.classList.remove("header-collapsed");
    }
  }

  window.addEventListener("scroll", updateHeaderCollapseState, { passive: true });
  updateHeaderCollapseState();

  function getDashboardColor(consigneId, index) {
    if (!state.dashboard) {
      return DASHBOARD_LINE_COLORS[index % DASHBOARD_LINE_COLORS.length];
    }
    if (!state.dashboard.colorByConsigne) {
      state.dashboard.colorByConsigne = new Map();
    }
    if (!state.dashboard.colorByConsigne.has(consigneId)) {
      const color = DASHBOARD_LINE_COLORS[index % DASHBOARD_LINE_COLORS.length];
      state.dashboard.colorByConsigne.set(consigneId, color);
    }
    return state.dashboard.colorByConsigne.get(consigneId);
  }

  function assignDashboardColors() {
    if (!state.dashboard) return;
    const consignes = state.dashboard.data?.consignes || [];
    state.dashboard.colorByConsigne = new Map();
    consignes.forEach((consigne, index) => {
      const color = DASHBOARD_LINE_COLORS[index % DASHBOARD_LINE_COLORS.length];
      state.dashboard.colorByConsigne.set(consigne.id, color);
    });
  }

  function handleDashboardPeriodClick(event) {
    if (!state.dashboard) return;
    const target = event.currentTarget;
    if (!target) return;
    const nextPeriod = Number.parseInt(target.dataset.dashboardPeriod, 10);
    if (!Number.isFinite(nextPeriod)) return;
    if (state.dashboard.period === nextPeriod) return;
    state.dashboard.period = nextPeriod;
    renderDashboard();
  }

  function getDashboardIterations() {
    if (!state.dashboard) return [];
    const iterations = Array.isArray(state.dashboard.data?.iterations)
      ? [...state.dashboard.data.iterations]
      : [];
    iterations.sort((a, b) => a - b);
    const period = state.dashboard.period || DASHBOARD_DEFAULT_PERIOD;
    const start = Math.max(0, iterations.length - period);
    return iterations.slice(start).reverse();
  }

  function updateDashboardPeriodButtons() {
    if (!state.dashboard || !ui.dashboardPeriodButtons) return;
    const currentPeriod = state.dashboard.period;
    ui.dashboardPeriodButtons.forEach((button) => {
      const period = Number.parseInt(button.dataset.dashboardPeriod, 10);
      const isActive = period === currentPeriod;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function renderDashboardTable(iterations) {
    if (!ui.dashboardTableHead || !ui.dashboardTableBody) return;
    const consignes = state.dashboard?.data?.consignes || [];
    ui.dashboardTableHead.innerHTML = "";
    ui.dashboardTableBody.innerHTML = "";

    const headerRow = ui.dashboardTableHead;
    const consigneHeader = document.createElement("th");
    consigneHeader.textContent = "Consigne";
    headerRow.appendChild(consigneHeader);

    if (iterations.length) {
      iterations.forEach((iteration) => {
        const th = document.createElement("th");
        th.textContent = `Itération ${iteration}`;
        headerRow.appendChild(th);
      });
    } else {
      const placeholder = document.createElement("th");
      placeholder.textContent = "Aucune itération";
      headerRow.appendChild(placeholder);
    }

    if (!iterations.length || !consignes.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = Math.max(2, iterations.length + 1);
      cell.className = "dashboard-empty-message";
      cell.textContent = "Aucune donnée à afficher pour cette période.";
      row.appendChild(cell);
      ui.dashboardTableBody.appendChild(row);
      return;
    }

    const useCompactResponses = iterations.length > 8;

    consignes.forEach((consigne, index) => {
      const row = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.textContent = consigne.label;
      row.appendChild(labelCell);

      iterations.forEach((iteration) => {
        const cell = document.createElement("td");
        const responseKey = consigne.responses?.[iteration];
        const config = responseKey ? DASHBOARD_RESPONSE_MAP[responseKey] : null;
        const chip = document.createElement("span");
        chip.className = "dashboard-response";
        if (useCompactResponses) {
          chip.classList.add("small");
        }
        if (config) {
          chip.classList.add(config.className);
          chip.textContent = config.label;
          chip.title = `${config.label} pour l'itération ${iteration}`;
        } else {
          chip.classList.add("dashboard-response--empty");
          chip.textContent = "—";
          chip.title = `Aucune réponse enregistrée pour l'itération ${iteration}`;
        }
        cell.appendChild(chip);
        row.appendChild(cell);
      });

      ui.dashboardTableBody.appendChild(row);
    });
  }

  function renderDashboardLegend() {
    if (!ui.dashboardLegend) return;
    ui.dashboardLegend.innerHTML = "";
    const consignes = state.dashboard?.data?.consignes || [];
    if (!consignes.length) {
      const message = document.createElement("p");
      message.className = "dashboard-empty-message";
      message.textContent = "Aucune consigne disponible.";
      ui.dashboardLegend.appendChild(message);
      return;
    }

    consignes.forEach((consigne, index) => {
      const item = document.createElement("div");
      item.className = "dashboard-legend-item";
      const swatch = document.createElement("span");
      swatch.className = "dashboard-legend-swatch";
      swatch.style.backgroundColor = getDashboardColor(consigne.id, index);
      item.appendChild(swatch);
      const label = document.createElement("span");
      label.textContent = consigne.label;
      item.appendChild(label);
      ui.dashboardLegend.appendChild(item);
    });
  }

  function renderDashboardChart(iterations) {
    if (!ui.dashboardChart) return;
    const svg = ui.dashboardChart;
    svg.innerHTML = "";
    const consignes = state.dashboard?.data?.consignes || [];

    if (!iterations.length || !consignes.length) {
      const width = 480;
      const height = 220;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      const ns = "http://www.w3.org/2000/svg";
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", width / 2);
      text.setAttribute("y", height / 2);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#64748b");
      text.textContent = "Aucune donnée à afficher";
      svg.appendChild(text);
      return;
    }

    const chronologicalIterations = [...iterations].reverse();
    const width = Math.max(chronologicalIterations.length * 80, 520);
    const height = 260;
    const margin = { top: 24, right: 32, bottom: 40, left: 80 };
    const chartWidth = Math.max(1, width - margin.left - margin.right);
    const chartHeight = Math.max(1, height - margin.top - margin.bottom);
    const ns = "http://www.w3.org/2000/svg";

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const scores = Object.values(DASHBOARD_RESPONSE_MAP).map((config) => config.score);
    const uniqueScores = Array.from(new Set(scores)).sort((a, b) => a - b);
    const minScore = uniqueScores[0];
    const maxScore = uniqueScores[uniqueScores.length - 1];
    const span = Math.max(1, maxScore - minScore);

    const scoreLabels = uniqueScores.reduce((acc, score) => {
      const match = Object.values(DASHBOARD_RESPONSE_MAP).find((config) => config.score === score);
      acc[score] = match ? match.label : `Niveau ${score}`;
      return acc;
    }, {});

    const mapScoreToY = (score) => {
      const ratio = (score - minScore) / span;
      return margin.top + chartHeight - ratio * chartHeight;
    };

    const verticalAxis = document.createElementNS(ns, "line");
    verticalAxis.setAttribute("x1", margin.left);
    verticalAxis.setAttribute("x2", margin.left);
    verticalAxis.setAttribute("y1", margin.top);
    verticalAxis.setAttribute("y2", height - margin.bottom);
    verticalAxis.setAttribute("class", "chart-axis");
    svg.appendChild(verticalAxis);

    const horizontalAxis = document.createElementNS(ns, "line");
    horizontalAxis.setAttribute("x1", margin.left);
    horizontalAxis.setAttribute("x2", width - margin.right);
    horizontalAxis.setAttribute("y1", height - margin.bottom);
    horizontalAxis.setAttribute("y2", height - margin.bottom);
    horizontalAxis.setAttribute("class", "chart-axis");
    svg.appendChild(horizontalAxis);

    uniqueScores.forEach((score) => {
      const y = mapScoreToY(score);
      const grid = document.createElementNS(ns, "line");
      grid.setAttribute("x1", margin.left);
      grid.setAttribute("x2", width - margin.right);
      grid.setAttribute("y1", y);
      grid.setAttribute("y2", y);
      grid.setAttribute("class", "chart-grid");
      svg.appendChild(grid);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", margin.left - 12);
      label.setAttribute("y", y + 4);
      label.setAttribute("text-anchor", "end");
      label.textContent = scoreLabels[score] || `Niveau ${score}`;
      svg.appendChild(label);
    });

    const xPositions = chronologicalIterations.map((iteration, index) => {
      if (chronologicalIterations.length === 1) {
        return margin.left + chartWidth / 2;
      }
      const ratio = index / (chronologicalIterations.length - 1);
      return margin.left + ratio * chartWidth;
    });

    chronologicalIterations.forEach((iteration, index) => {
      const x = xPositions[index];
      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", height - margin.bottom + 24);
      label.setAttribute("text-anchor", "middle");
      label.textContent = iteration;
      svg.appendChild(label);
    });

    consignes.forEach((consigne, consigneIndex) => {
      const color = getDashboardColor(consigne.id, consigneIndex);
      const segments = [];
      let currentSegment = [];

      chronologicalIterations.forEach((iteration, index) => {
        const responseKey = consigne.responses?.[iteration];
        const config = responseKey ? DASHBOARD_RESPONSE_MAP[responseKey] : null;
        if (!config) {
          if (currentSegment.length) {
            segments.push(currentSegment);
            currentSegment = [];
          }
          return;
        }
        const point = {
          x: xPositions[index],
          y: mapScoreToY(config.score),
          iteration,
          label: config.label
        };
        currentSegment.push(point);
      });

      if (currentSegment.length) {
        segments.push(currentSegment);
      }

      segments.forEach((segment) => {
        if (segment.length > 1) {
          const path = document.createElementNS(ns, "path");
          let d = `M ${segment[0].x} ${segment[0].y}`;
          for (let i = 1; i < segment.length; i += 1) {
            d += ` L ${segment[i].x} ${segment[i].y}`;
          }
          path.setAttribute("d", d);
          path.setAttribute("class", "chart-line");
          path.setAttribute("stroke", color);
          svg.appendChild(path);
        }

        segment.forEach((point) => {
          const circle = document.createElementNS(ns, "circle");
          circle.setAttribute("cx", point.x);
          circle.setAttribute("cy", point.y);
          circle.setAttribute("r", 4.5);
          circle.setAttribute("fill", color);
          circle.setAttribute("class", "chart-point");
          circle.setAttribute(
            "aria-label",
            `${consigne.label} — ${point.label} (itération ${point.iteration})`
          );
          svg.appendChild(circle);
        });
      });
    });
  }

  function renderDashboard() {
    if (!state.dashboard) return;
    updateDashboardPeriodButtons();
    const iterations = getDashboardIterations();
    renderDashboardTable(iterations);
    renderDashboardLegend();
    renderDashboardChart(iterations);
  }

  function initDashboard() {
    if (!ui.dashboardPanel) return;
    state.dashboard = {
      data: DASHBOARD_SAMPLE_DATA,
      period: DASHBOARD_DEFAULT_PERIOD,
      colorByConsigne: new Map()
    };
    assignDashboardColors();
    if (ui.dashboardPeriodButtons && ui.dashboardPeriodButtons.length) {
      ui.dashboardPeriodButtons.forEach((button) => {
        button.addEventListener("click", handleDashboardPeriodClick);
      });
    }
    renderDashboard();
  }

  showView(null);
  ui.logoutBtn.disabled = true;
  updateFontSizeDisplay();
  if (ui.fontFamily) {
    ui.fontFamily.value = DEFAULT_FONT_FAMILY;
  }
  if (ui.blockFormat) {
    ui.blockFormat.value = "p";
  }

  const mobileMediaQuery = window.matchMedia("(max-width: 900px)");
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
    const shouldOpen = Boolean(open);
    const isOpen = ui.toolbarMorePanel.classList.contains("is-open");

    if (shouldOpen) {
      if (!mobileMediaQuery.matches) {
        ui.toolbarMorePanel.classList.remove("is-open");
        ui.toolbarMoreBtn.setAttribute("aria-expanded", "false");
        ui.toolbarMorePanel.removeAttribute("aria-hidden");
        document.removeEventListener("click", handleToolbarOutsideClick);
        return;
      }
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
      if (mobileMediaQuery.matches) {
        ui.toolbarMorePanel.setAttribute("aria-hidden", "true");
      } else {
        ui.toolbarMorePanel.removeAttribute("aria-hidden");
      }
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

  function showEmptyEditor() {
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

    refreshAllClozes();

    state.lastSavedAt = state.currentNote.updatedAt instanceof Date ? state.currentNote.updatedAt : null;
    if (state.hasUnsavedChanges) {
      updateSaveStatus("dirty");
    } else {
      updateSaveStatus(state.lastSavedAt ? "saved" : "", state.lastSavedAt || null);
    }
    updateFontSizeDisplay();
    rememberEditorSelection();
  }

  function queueRemoteNoteUpdate(note) {
    if (!note || note.id !== state.currentNoteId) {
      state.pendingRemoteNote = null;
      return;
    }
    state.pendingRemoteNote = { ...note };
  }

  function applyPendingRemoteNote() {
    if (!state.pendingRemoteNote || state.pendingRemoteNote.id !== state.currentNoteId) {
      state.pendingRemoteNote = null;
      return;
    }
    state.currentNote = { ...state.pendingRemoteNote };
    state.pendingRemoteNote = null;
    state.hasUnsavedChanges = false;
    applyCurrentNoteToEditor();
  }

  function updateActiveNoteHighlight() {
    const items = ui.notesContainer.querySelectorAll(".note-card");
    items.forEach((item) => {
      const noteId = item.dataset.noteId;
      item.classList.toggle("active", noteId === state.currentNoteId);
    });
  }

  function renderNotes() {
    ui.notesContainer.innerHTML = "";
    if (!state.notes.length) {
      const empty = document.createElement("p");
      empty.className = "muted small";
      empty.textContent = "Aucune fiche pour le moment. Ajoutez-en une pour commencer.";
      ui.notesContainer.appendChild(empty);
      return;
    }

    state.notes.forEach((note) => {
      const row = document.createElement("div");
      row.className = "note-row";

      const card = document.createElement("button");
      card.type = "button";
      card.className = "note-card";
      card.dataset.noteId = note.id;
      card.addEventListener("click", () => {
        selectNoteById(note.id).catch((error) => {
          console.error("Impossible d'ouvrir la fiche", error);
          showToast("Impossible d'ouvrir la fiche", "error");
        });
      });

      const title = document.createElement("span");
      title.className = "note-card-title";
      title.textContent = note.title && note.title.trim() ? note.title.trim() : "Sans titre";
      card.appendChild(title);

      const meta = document.createElement("span");
      meta.className = "note-card-meta";
      meta.textContent = formatRelativeDate(note.updatedAt);
      card.appendChild(meta);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "icon-button";
      deleteBtn.title = "Supprimer la fiche";
      deleteBtn.textContent = "✕";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteNote(note.id).catch((error) => {
          console.error("Impossible de supprimer la fiche", error);
          showToast("Impossible de supprimer la fiche", "error");
        });
      });

      row.appendChild(card);
      row.appendChild(deleteBtn);
      ui.notesContainer.appendChild(row);
    });

    updateActiveNoteHighlight();
  }

  function updateNotesFromSnapshot(snapshot) {
    state.notes = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      const toDate = (value) => (value && typeof value.toDate === "function" ? value.toDate() : null);
      return {
        id: docSnap.id,
        title: data.title || "",
        contentHtml: data.contentHtml || "",
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt)
      };
    });

    renderNotes();
    ensureCurrentSelection();
  }

  function ensureCurrentSelection() {
    if (state.pendingSelectionId) {
      const pending = state.notes.find((note) => note.id === state.pendingSelectionId);
      if (pending) {
        state.pendingSelectionId = null;
        openNote(pending, { skipFlush: true });
      }
      return;
    }

    if (state.currentNoteId) {
      const current = state.notes.find((note) => note.id === state.currentNoteId);
      if (current) {
        if (state.hasUnsavedChanges && state.currentNote) {
          updateSaveStatus("dirty");
        } else if (state.isEditorFocused) {
          queueRemoteNoteUpdate(current);
        } else {
          state.currentNote = { ...current };
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
    state.currentNote = { ...note };
    state.hasUnsavedChanges = false;
    applyCurrentNoteToEditor({ force: true });
    updateActiveNoteHighlight();
    setTimeout(() => ui.noteTitle.focus(), 80);
  }

  async function selectNoteById(noteId) {
    if (!noteId) return;
    if (state.currentNoteId === noteId && state.currentNote) {
      return;
    }
    const target = state.notes.find((note) => note.id === noteId);
    if (!target) return;
    await openNote(target);
  }

  function updateLocalNoteCache(noteId, updates) {
    state.notes = state.notes.map((note) => (note.id === noteId ? { ...note, ...updates } : note));
  }

  function handleTitleInput(event) {
    if (!state.currentNote) return;
    state.currentNote.title = event.target.value;
    state.hasUnsavedChanges = true;
    state.pendingRemoteNote = null;
    updateLocalNoteCache(state.currentNoteId, { title: event.target.value });
    const activeTitle = ui.notesContainer.querySelector(
      `.note-card[data-note-id="${state.currentNoteId}"] .note-card-title`
    );
    if (activeTitle) {
      activeTitle.textContent =
        state.currentNote.title && state.currentNote.title.trim()
          ? state.currentNote.title.trim()
          : "Sans titre";
    }
    updateActiveNoteHighlight();
    updateSaveStatus("dirty");
    scheduleSave();
  }

  function handleEditorInput() {
    if (!state.currentNote) return;
    refreshAllClozes();
    state.currentNote.contentHtml = ui.noteEditor.innerHTML;
    state.hasUnsavedChanges = true;
    state.pendingRemoteNote = null;
    updateSaveStatus("dirty");
    scheduleSave();
    rememberEditorSelection();
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
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function rememberEditorSelection() {
    if (!ui.noteEditor) {
      state.savedSelection = null;
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

  function focusEditorPreservingSelection(preservedSelection = null) {
    if (!ui.noteEditor) return;
    const selectionToRestore = preservedSelection || state.savedSelection || null;
    ui.noteEditor.focus({ preventScroll: true });
    if (selectionToRestore) {
      restoreSelection(ui.noteEditor, selectionToRestore);
    }
    rememberEditorSelection();
  }

  function runWithPreservedSelection(operation) {
    if (typeof operation !== "function") {
      return;
    }
    restoreEditorSelection();
    const result = operation();
    const updatedSelection = captureSelection(ui.noteEditor);
    focusEditorPreservingSelection(updatedSelection);
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
      handleEditorInput();
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
    handleEditorInput();
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

  async function createNote() {
    if (!state.pseudo) return;
    try {
      const notesRef = collection(db, "users", state.pseudo, "notes");
      const docRef = await addDoc(notesRef, {
        title: "Nouvelle fiche",
        contentHtml: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
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

  async function deleteNote(noteId) {
    if (!state.pseudo || !noteId) return;
    const note = state.notes.find((item) => item.id === noteId);
    const confirmed = window.confirm(`Supprimer la fiche "${note?.title || "Sans titre"}" ?`);
    if (!confirmed) return;
    try {
      await flushPendingSave();
      await deleteDoc(doc(db, "users", state.pseudo, "notes", noteId));
      if (state.currentNoteId === noteId) {
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

  async function ensureUserExists(pseudo) {
    const ref = doc(db, "users", pseudo);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        createdAt: serverTimestamp()
      });
    }
  }

  function subscribeToNotes() {
    if (!state.pseudo) return;
    const ref = collection(db, "users", state.pseudo, "notes");
    const q = query(ref, orderBy("updatedAt", "desc"));
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
    state.notes = [];
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
    if (!pseudoKey || pseudoKey.length < MIN_PSEUDO_LENGTH) {
      showToast(
        `Pseudo invalide. Utilisez au moins ${MIN_PSEUDO_LENGTH} caractères autorisés (lettres, chiffres, . _ -).`,
        "error"
      );
      return;
    }
    ui.loginButton.disabled = true;
    ui.pseudoInput.disabled = true;
    try {
      await login(pseudoKey, displayName);
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
    }
  }

  async function login(pseudoKey, displayName) {
    state.pendingDisplayName = displayName;
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
      await ensureUserExists(pseudoKey);
    } catch (error) {
      state.pendingDisplayName = null;
      throw error;
    }
  }

  async function handleAuthState(user) {
    const pendingDisplayName = state.pendingDisplayName;
    resetState();
    if (!user) {
      state.pendingDisplayName = null;
      ui.loginForm.reset();
      showView("login");
      return;
    }

    const pseudoKey = extractPseudoFromEmail(user.email || "");
    if (!pseudoKey) {
      console.error("Utilisateur connecté avec une adresse e-mail inattendue", user.email);
      state.pendingDisplayName = null;
      showToast("Profil invalide détecté. Déconnexion en cours.", "error");
      await signOut(auth);
      return;
    }

    state.pseudo = pseudoKey;
    const resolvedDisplayName = user.displayName || pendingDisplayName || pseudoKey;
    state.displayName = resolvedDisplayName;
    state.pendingDisplayName = null;
    ui.currentUser.textContent = `Connecté en tant que ${resolvedDisplayName}`;
    ui.logoutBtn.disabled = false;
    ui.loginForm.reset();
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
    ui.noteEditor.addEventListener("focus", () => {
      state.isEditorFocused = true;
      rememberEditorSelection();
    });
    ui.noteEditor.addEventListener("keyup", rememberEditorSelection);
    ui.noteEditor.addEventListener("mouseup", rememberEditorSelection);
    ui.noteEditor.addEventListener("touchend", rememberEditorSelection);
    ui.noteEditor.addEventListener("blur", () => {
      state.isEditorFocused = false;
      if (!state.hasUnsavedChanges) {
        applyPendingRemoteNote();
      } else {
        state.pendingRemoteNote = null;
      }
    });
    ui.toolbar.addEventListener("click", handleToolbarClick);
    ui.toolbar.addEventListener("change", handleToolbarChange);
    if (ui.toolbarMoreBtn) {
      ui.toolbarMoreBtn.addEventListener("click", () => toggleToolbarMoreMenu());
    }
    if (ui.clozeFeedback) {
      ui.clozeFeedback.addEventListener("click", handleClozeFeedbackClick);
    }
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("resize", hideClozeFeedback);
    window.addEventListener("beforeunload", (event) => {
      if (state.hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  initDashboard();
  initEvents();
  initAuth();
}
