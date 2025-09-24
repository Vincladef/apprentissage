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
  getDocs,
  writeBatch,
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

const firebaseConfig = {
  apiKey: "AIzaSyCeI19b-aD4qNtSgue7STypajkd8mQZJNo",
  authDomain: "apprentissage-55116.firebaseapp.com",
  projectId: "apprentissage-55116",
  storageBucket: "apprentissage-55116.firebasestorage.app",
  messagingSenderId: "494031174520",
  appId: "1:494031174520:web:3a878e5ec131da3ebaa68d",
  measurementId: "G-LRFMSS2E1R"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const AUTH_EMAIL_DOMAIN = "pseudo.apprentissage";
const AUTH_PASSWORD_SUFFIX = "#appr";
const MIN_PSEUDO_LENGTH = 3;

const state = {
  pseudo: null,
  displayName: null,
  pendingDisplayName: null,
  coursesUnsubscribe: null,
  pagesUnsubscribe: null,
  courses: [],
  pages: [],
  currentCourse: null,
  currentPage: null,
  currentClozeStates: {},
  revisionHandlers: new Map()
};

const views = {
  login: document.getElementById("login-screen"),
  dashboard: document.getElementById("dashboard-screen"),
  course: document.getElementById("course-screen")
};

const ui = {
  loginForm: document.getElementById("login-form"),
  pseudoInput: document.getElementById("pseudo"),
  loginButton: document.querySelector("#login-form button[type='submit']"),
  currentUser: document.getElementById("current-user"),
  logoutBtn: document.getElementById("logout-btn"),
  newCourseForm: document.getElementById("new-course-form"),
  newCourseName: document.getElementById("new-course-name"),
  coursesList: document.getElementById("courses-list"),
  backToDashboard: document.getElementById("back-to-dashboard"),
  courseTitle: document.getElementById("course-title"),
  addRootPage: document.getElementById("add-root-page"),
  addPageForm: document.getElementById("add-page-form"),
  pageTitleInput: document.getElementById("page-title-input"),
  parentSelect: document.getElementById("parent-select"),
  pagesTree: document.getElementById("pages-tree"),
  editorTab: document.getElementById("editor-tab"),
  revisionTab: document.getElementById("revision-tab"),
  editorView: document.getElementById("editor-view"),
  revisionView: document.getElementById("revision-view"),
  pageEmpty: document.getElementById("page-empty"),
  editor: document.getElementById("editor"),
  saveButton: document.getElementById("save-page-btn"),
  saveStatus: document.getElementById("save-status"),
  insertImageBtn: document.getElementById("insert-image-btn"),
  createClozeBtn: document.getElementById("create-cloze-btn"),
  removeClozeBtn: document.getElementById("remove-cloze-btn"),
  revisionContent: document.getElementById("revision-content"),
  newIterationBtn: document.getElementById("new-iteration-btn"),
  toast: document.getElementById("toast")
};

const editorToolbar = document.querySelector(".editor-toolbar");
ui.logoutBtn.disabled = true;

function showView(view) {
  Object.values(views).forEach((section) => section.classList.add("hidden"));
  Object.values(views).forEach((section) => section.classList.remove("active"));
  const target = views[view];
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
  }
}

function showToast(message, type = "info") {
  ui.toast.textContent = message;
  ui.toast.dataset.type = type;
  ui.toast.classList.remove("hidden");
  setTimeout(() => {
    ui.toast.classList.add("hidden");
  }, 2400);
}

function safeId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `cloze-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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

function normalizeClozeStateEntry(entry = {}) {
  const answer = entry.answer ?? "";
  const rawScore = Number(entry.score ?? entry.counter ?? 0);
  const score = Math.max(0, Number.isFinite(rawScore) ? Number(rawScore.toFixed(2)) : 0);
  const fallbackCounter = Math.max(0, Math.floor(score));
  const rawCounter = Number(entry.counter ?? fallbackCounter);
  const counter = Number.isFinite(rawCounter)
    ? Math.max(0, Math.min(fallbackCounter, Math.floor(rawCounter)))
    : fallbackCounter;
  return {
    answer,
    counter,
    score
  };
}

function normalizeClozeStates(states = {}) {
  const normalized = {};
  Object.entries(states).forEach(([key, value]) => {
    normalized[key] = normalizeClozeStateEntry({ ...value });
  });
  return normalized;
}

function resetState() {
  if (state.coursesUnsubscribe) {
    state.coursesUnsubscribe();
    state.coursesUnsubscribe = null;
  }
  if (state.pagesUnsubscribe) {
    state.pagesUnsubscribe();
    state.pagesUnsubscribe = null;
  }
  state.pseudo = null;
  state.displayName = null;
  state.courses = [];
  state.pages = [];
  state.currentCourse = null;
  state.currentPage = null;
  state.currentClozeStates = {};
  state.revisionHandlers.clear();
  ui.coursesList.innerHTML = "";
  ui.pagesTree.innerHTML = "";
  ui.editor.innerHTML = "";
  ui.revisionContent.innerHTML = "";
  ui.courseTitle.textContent = "";
  ui.saveStatus.textContent = "";
  ui.currentUser.textContent = "";
  togglePagePanels(false);
  ui.pageEmpty.classList.remove("hidden");
  ui.logoutBtn.disabled = true;
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

function handleLoginSubmit(event) {
  event.preventDefault();
  const { pseudoKey, displayName } = normalizePseudoInput(ui.pseudoInput.value);
  if (!pseudoKey || pseudoKey.length < MIN_PSEUDO_LENGTH) {
    showToast(
      `Pseudo invalide. Utilisez au moins ${MIN_PSEUDO_LENGTH} caractères autorisés (lettres, chiffres, . _ -).`,
      "error"
    );
    return;
  }
  if (ui.loginButton) {
    ui.loginButton.disabled = true;
  }
  ui.pseudoInput.disabled = true;
  login(pseudoKey, displayName)
    .catch((err) => {
      console.error(err);
      let message = "Impossible de se connecter";
      switch (err?.code) {
        case "auth/invalid-email":
        case "auth/missing-email":
          message = "Pseudo invalide. Vérifiez les caractères utilisés.";
          break;
        case "auth/too-many-requests":
          message = "Trop de tentatives de connexion. Réessayez plus tard.";
          break;
        case "auth/network-request-failed":
          message = "Connexion réseau requise pour accéder à votre compte.";
          break;
        case "auth/wrong-password":
          message = "Ce pseudo est associé à un mot de passe différent. Contactez un administrateur.";
          break;
        default:
          break;
      }
      showToast(message, "error");
    })
    .finally(() => {
      if (ui.loginButton) {
        ui.loginButton.disabled = false;
      }
      ui.pseudoInput.disabled = false;
    });
}

async function login(pseudoKey, displayName) {
  state.pendingDisplayName = displayName;
  const email = buildAuthEmail(pseudoKey);
  const password = buildAuthPassword(pseudoKey);
  try {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUserExists(pseudoKey);
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
    const currentUser = auth.currentUser;
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

  try {
    await ensureUserExists(pseudoKey);
  } catch (error) {
    console.error("Impossible d'initialiser le profil Firestore", error);
    showToast("Impossible de préparer votre compte", "error");
    await signOut(auth);
    return;
  }

  subscribeToCourses();
  showView("dashboard");
}

async function logout() {
  ui.logoutBtn.disabled = true;
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    ui.logoutBtn.disabled = false;
    showToast("Impossible de se déconnecter", "error");
  }
}

function subscribeToCourses() {
  if (!state.pseudo) return;
  const ref = collection(db, "users", state.pseudo, "courses");
  const q = query(ref, orderBy("createdAt", "asc"));
  if (state.coursesUnsubscribe) {
    state.coursesUnsubscribe();
  }
  state.coursesUnsubscribe = onSnapshot(q, (snapshot) => {
    state.courses = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    renderCourses();
  });
}

function renderCourses() {
  ui.coursesList.innerHTML = "";
  if (state.courses.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun cours pour le moment. Créez votre premier cours !";
    ui.coursesList.appendChild(empty);
    return;
  }

  state.courses.forEach((course) => {
    const card = document.createElement("div");
    card.className = "course-card";
    const title = document.createElement("h3");
    title.textContent = course.name;
    card.appendChild(title);

    if (course.description) {
      const desc = document.createElement("p");
      desc.textContent = course.description;
      card.appendChild(desc);
    }

    const actions = document.createElement("div");
    actions.className = "course-card-actions";

    const openBtn = document.createElement("button");
    openBtn.textContent = "Ouvrir";
    openBtn.addEventListener("click", () => openCourse(course));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Supprimer";
    deleteBtn.className = "secondary";
    deleteBtn.addEventListener("click", () => deleteCourse(course));

    actions.appendChild(openBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(actions);
    ui.coursesList.appendChild(card);
  });
}

async function deleteCourse(course) {
  if (!state.pseudo || !course) return;
  const confirmed = window.confirm(`Supprimer le cours "${course.name}" ?`);
  if (!confirmed) return;

  try {
    const pagesRef = collection(db, "users", state.pseudo, "courses", course.id, "pages");
    const snapshot = await getDocs(pagesRef);
    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    batch.delete(doc(db, "users", state.pseudo, "courses", course.id));
    await batch.commit();
    showToast("Cours supprimé");
  } catch (error) {
    console.error(error);
    showToast("Erreur lors de la suppression", "error");
  }
}

async function handleNewCourse(event) {
  event.preventDefault();
  const name = ui.newCourseName.value.trim();
  if (!name || !state.pseudo) return;
  try {
    await addDoc(collection(db, "users", state.pseudo, "courses"), {
      name,
      createdAt: serverTimestamp()
    });
    ui.newCourseName.value = "";
    showToast("Cours créé");
  } catch (error) {
    console.error(error);
    showToast("Impossible de créer le cours", "error");
  }
}

function openCourse(course) {
  state.currentCourse = course;
  state.pages = [];
  state.currentPage = null;
  ui.pagesTree.innerHTML = "";
  ui.editor.innerHTML = "";
  ui.revisionContent.innerHTML = "";
  ui.pageEmpty.classList.remove("hidden");
  togglePagePanels(false);
  ui.courseTitle.textContent = course.name;
  showView("course");
  subscribeToPages();
  switchToTab("editor");
}

function subscribeToPages() {
  if (!state.pseudo || !state.currentCourse) return;
  const ref = collection(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages");
  const q = query(ref, orderBy("order", "asc"));
  if (state.pagesUnsubscribe) {
    state.pagesUnsubscribe();
  }
  state.pagesUnsubscribe = onSnapshot(q, (snapshot) => {
    state.pages = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        clozeStates: normalizeClozeStates(data.clozeStates || {})
      };
    });
    renderPagesTree();
    updateParentOptions();
    if (state.currentPage) {
      const fresh = state.pages.find((page) => page.id === state.currentPage.id);
      if (fresh) {
        state.currentPage = {
          ...fresh,
          clozeStates: normalizeClozeStates(fresh.clozeStates || {})
        };
        loadPageIntoEditor(state.currentPage);
      } else {
        state.currentPage = null;
        ui.editor.innerHTML = "";
        ui.revisionContent.innerHTML = "";
        ui.pageEmpty.classList.remove("hidden");
        togglePagePanels(false);
      }
    }
  });
}

function updateParentOptions() {
  ui.parentSelect.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "(niveau principal)";
  ui.parentSelect.appendChild(defaultOption);

  const buildOptions = (nodes, depth = 0) => {
    nodes.forEach((node) => {
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = `${"\u00A0".repeat(depth * 2)}${node.title}`;
      ui.parentSelect.appendChild(option);
      if (node.children && node.children.length > 0) {
        buildOptions(node.children, depth + 1);
      }
    });
  };

  const tree = buildPageTree();
  buildOptions(tree);
}

function buildPageTree() {
  const map = new Map();
  const nodes = state.pages.map((page) => ({ ...page, children: [] }));
  nodes.forEach((node) => map.set(node.id, node));
  const roots = [];
  nodes.forEach((node) => {
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (list) => {
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    list.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

function renderPagesTree() {
  ui.pagesTree.innerHTML = "";
  const tree = buildPageTree();
  if (tree.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Ajoutez un chapitre pour commencer.";
    ui.pagesTree.appendChild(empty);
    return;
  }

  const buildList = (nodes) => {
    const ul = document.createElement("ul");
    nodes.forEach((node) => {
      const li = document.createElement("li");
      const title = document.createElement("div");
      title.className = "node-title";
      title.textContent = node.title || "Sans titre";
      title.addEventListener("click", () => selectPage(node));
      if (state.currentPage && state.currentPage.id === node.id) {
        li.classList.add("active");
      }
      li.appendChild(title);

      const actions = document.createElement("div");
      actions.className = "node-actions";
      const renameBtn = document.createElement("button");
      renameBtn.textContent = "Renommer";
      renameBtn.className = "secondary";
      renameBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        renamePage(node);
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Supprimer";
      deleteBtn.className = "secondary";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        deletePage(node);
      });
      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      li.appendChild(actions);

      if (node.children && node.children.length > 0) {
        li.appendChild(buildList(node.children));
      }
      ul.appendChild(li);
    });
    return ul;
  };

  ui.pagesTree.appendChild(buildList(tree));
}

function selectPage(page) {
  state.currentPage = {
    ...page,
    clozeStates: normalizeClozeStates(page.clozeStates || {})
  };
  loadPageIntoEditor(state.currentPage);
  switchToTab(ui.editorTab.classList.contains("active") ? "editor" : "revision");
}

function loadPageIntoEditor(page) {
  if (!page) {
    togglePagePanels(false);
    ui.pageEmpty.classList.remove("hidden");
    return;
  }
  ui.pageEmpty.classList.add("hidden");
  togglePagePanels(true);
  ui.editor.innerHTML = page.contentHtml || "";
  const normalizedStates = normalizeClozeStates(page.clozeStates || {});
  state.currentClozeStates = normalizedStates;
  state.currentPage = {
    ...(state.currentPage || {}),
    ...page,
    clozeStates: normalizedStates
  };
  state.revisionHandlers.clear();
  ui.revisionContent.innerHTML = "";
  ui.saveStatus.textContent = "";
  renderRevisionView();
}

function togglePagePanels(visible) {
  if (!visible) {
    ui.editorView.classList.add("hidden");
    ui.revisionView.classList.add("hidden");
  } else {
    const editorActive = ui.editorTab.classList.contains("active");
    ui.editorView.classList.toggle("hidden", !editorActive);
    ui.revisionView.classList.toggle("hidden", editorActive);
  }
}

function switchToTab(target) {
  if (!state.currentPage) {
    togglePagePanels(false);
    return;
  }
  if (target === "editor") {
    ui.editorTab.classList.add("active");
    ui.revisionTab.classList.remove("active");
    ui.editorView.classList.remove("hidden");
    ui.revisionView.classList.add("hidden");
  } else {
    ui.revisionTab.classList.add("active");
    ui.editorTab.classList.remove("active");
    ui.revisionView.classList.remove("hidden");
    ui.editorView.classList.add("hidden");
    renderRevisionView();
  }
}

function handleAddRootPage() {
  if (!state.pseudo || !state.currentCourse) return;
  const title = window.prompt("Nom du chapitre ?");
  if (!title) return;
  createPage(title, null);
}

function handleAddPage(event) {
  event.preventDefault();
  const title = ui.pageTitleInput.value.trim();
  if (!title) return;
  const parentId = ui.parentSelect.value || null;
  createPage(title, parentId);
  ui.pageTitleInput.value = "";
}

async function createPage(title, parentId) {
  if (!state.pseudo || !state.currentCourse) return;
  try {
    await addDoc(collection(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages"), {
      title,
      parentId: parentId || null,
      order: Date.now(),
      contentHtml: "",
      clozeStates: {},
      createdAt: serverTimestamp()
    });
    showToast("Page créée");
  } catch (error) {
    console.error(error);
    showToast("Erreur lors de la création", "error");
  }
}

async function renamePage(page) {
  if (!state.pseudo || !state.currentCourse || !page) return;
  const title = window.prompt("Nouveau titre", page.title || "");
  if (!title) return;
  try {
    await updateDoc(doc(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages", page.id), {
      title
    });
    showToast("Titre mis à jour");
  } catch (error) {
    console.error(error);
    showToast("Impossible de renommer", "error");
  }
}

async function deletePage(page) {
  if (!state.pseudo || !state.currentCourse || !page) return;
  const confirmed = window.confirm(`Supprimer "${page.title}" et ses sous-pages ?`);
  if (!confirmed) return;
  try {
    const descendants = collectDescendants(page.id);
    const batch = writeBatch(db);
    descendants.forEach((id) => {
      batch.delete(doc(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages", id));
    });
    batch.delete(doc(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages", page.id));
    await batch.commit();
    if (state.currentPage && state.currentPage.id === page.id) {
      state.currentPage = null;
      ui.editor.innerHTML = "";
      ui.revisionContent.innerHTML = "";
      ui.pageEmpty.classList.remove("hidden");
      togglePagePanels(false);
    }
    showToast("Page supprimée");
  } catch (error) {
    console.error(error);
    showToast("Erreur lors de la suppression", "error");
  }
}

function collectDescendants(pageId) {
  const result = [];
  const queue = [pageId];
  while (queue.length > 0) {
    const current = queue.shift();
    state.pages.forEach((page) => {
      if (page.parentId === current) {
        result.push(page.id);
        queue.push(page.id);
      }
    });
  }
  return result;
}

function handleToolbarClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const command = button.dataset.command;
  if (!command) return;
  const value = button.dataset.value || null;
  document.execCommand(command, false, value);
  ui.editor.focus();
}

function insertImage() {
  const url = window.prompt("URL de l'image");
  if (!url) return;
  document.execCommand("insertImage", false, url);
}

function selectionInsideEditor() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!ui.editor.contains(range.commonAncestorContainer)) {
    return null;
  }
  return { selection, range };
}

function createCloze() {
  const context = selectionInsideEditor();
  if (!context) {
    showToast("Sélectionnez un texte dans l'éditeur", "warning");
    return;
  }
  const { selection, range } = context;
  if (selection.isCollapsed) {
    showToast("Sélection vide", "warning");
    return;
  }
  const startNode = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const endNode = range.endContainer.nodeType === Node.ELEMENT_NODE
    ? range.endContainer
    : range.endContainer.parentElement;
  if ((startNode && startNode.closest(".cloze")) || (endNode && endNode.closest(".cloze"))) {
    showToast("La sélection contient déjà un trou", "warning");
    return;
  }
  const text = selection.toString();
  if (!text.trim()) {
    showToast("Sélection invalide", "warning");
    return;
  }
  const span = document.createElement("span");
  span.className = "cloze";
  const id = safeId();
  span.dataset.id = id;
  span.dataset.answer = text;
  span.dataset.counter = "0";
  span.dataset.score = "0";
  span.textContent = text;
  range.deleteContents();
  range.insertNode(span);
  const newRange = document.createRange();
  newRange.setStartAfter(span);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);
  updateClozeStatesFromEditor();
}

function removeCloze() {
  const context = selectionInsideEditor();
  if (!context) {
    showToast("Sélectionnez un trou", "warning");
    return;
  }
  const { selection, range } = context;
  let node = range.startContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }
  const cloze = node && node.closest(".cloze");
  if (!cloze || !ui.editor.contains(cloze)) {
    showToast("Aucun trou ici", "warning");
    return;
  }
  const text = cloze.textContent;
  const textNode = document.createTextNode(text);
  cloze.replaceWith(textNode);
  selection.removeAllRanges();
  const newRange = document.createRange();
  newRange.setStart(textNode, textNode.length);
  newRange.collapse(true);
  selection.addRange(newRange);
  const id = cloze.dataset.id;
  if (id && state.currentClozeStates[id]) {
    delete state.currentClozeStates[id];
  }
  updateClozeStatesFromEditor();
}

function updateClozeStatesFromEditor() {
  const spans = ui.editor.querySelectorAll("span.cloze");
  const updated = {};
  spans.forEach((span) => {
    let id = span.dataset.id;
    if (!id) {
      id = safeId();
      span.dataset.id = id;
    }
    const previous = normalizeClozeStateEntry(state.currentClozeStates[id] || {});
    const answer = span.textContent;
    const score = previous.score;
    const fallbackCounter = Math.max(0, Math.floor(score));
    const rawCounter = previous.counter ?? Number(span.dataset.counter || fallbackCounter);
    const counter = Math.max(0, Math.min(fallbackCounter, Number(rawCounter || 0)));
    span.dataset.answer = answer;
    span.dataset.counter = String(counter);
    span.dataset.score = String(score);
    updated[id] = {
      answer,
      counter,
      score
    };
  });
  state.currentClozeStates = normalizeClozeStates(updated);
  if (state.currentPage) {
    state.currentPage = {
      ...state.currentPage,
      clozeStates: state.currentClozeStates
    };
  }
}

async function savePage() {
  if (!state.currentPage || !state.pseudo || !state.currentCourse) return;
  updateClozeStatesFromEditor();
  ui.saveButton.disabled = true;
  ui.saveStatus.textContent = "Enregistrement...";
  try {
    const normalizedStates = normalizeClozeStates(state.currentClozeStates);
    await updateDoc(doc(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages", state.currentPage.id), {
      contentHtml: ui.editor.innerHTML,
      clozeStates: normalizedStates,
      updatedAt: serverTimestamp()
    });
    state.currentPage = {
      ...state.currentPage,
      contentHtml: ui.editor.innerHTML,
      clozeStates: normalizedStates
    };
    state.pages = state.pages.map((page) =>
      page.id === state.currentPage.id
        ? {
            ...page,
            contentHtml: state.currentPage.contentHtml,
            clozeStates: normalizeClozeStates(state.currentPage.clozeStates)
          }
        : page
    );
    renderRevisionView();
    ui.saveStatus.textContent = "Enregistré";
    showToast("Page sauvegardée", "success");
  } catch (error) {
    console.error(error);
    ui.saveStatus.textContent = "Erreur";
    showToast("Impossible d'enregistrer", "error");
  } finally {
    ui.saveButton.disabled = false;
    setTimeout(() => {
      ui.saveStatus.textContent = "";
    }, 2000);
  }
}

function renderRevisionView() {
  if (!state.currentPage) {
    ui.revisionContent.innerHTML = "";
    return;
  }
  ui.revisionContent.innerHTML = state.currentPage.contentHtml || "<p class=\"muted\">Aucun contenu enregistré.</p>";
  state.revisionHandlers.clear();
  const spans = ui.revisionContent.querySelectorAll("span.cloze");
  spans.forEach((span) => {
    const id = span.dataset.id;
    const stateData = normalizeClozeStateEntry(
      (state.currentPage.clozeStates || {})[id] || { answer: span.textContent }
    );
    span.dataset.answer = stateData.answer;
    span.dataset.counter = stateData.counter;
    span.dataset.score = stateData.score;
    span.textContent = stateData.answer;
    span.classList.remove("needs-review");
    span.dataset.reviewed = "false";
    if (Number(stateData.counter || 0) <= 0) {
      span.classList.add("needs-review");
      span.textContent = "";
      const handler = () => handleClozeReveal(span);
      span.addEventListener("click", handler);
      state.revisionHandlers.set(id, handler);
    }
  });
}

function handleClozeReveal(span) {
  const id = span.dataset.id;
  const stateData = (state.currentPage?.clozeStates || {})[id];
  if (!stateData) return;
  if (!span.classList.contains("needs-review")) return;
  span.classList.remove("needs-review");
  span.textContent = stateData.answer;
  span.dataset.reviewed = "true";
  const handler = state.revisionHandlers.get(id);
  if (handler) {
    span.removeEventListener("click", handler);
    state.revisionHandlers.delete(id);
  }
  const panel = createRatingPanel(id, span);
  span.insertAdjacentElement("afterend", panel);
}

function createRatingPanel(id, span) {
  const panel = document.createElement("div");
  panel.className = "rating-panel";
  const options = [
    { key: "yes", label: "✅ Oui", delta: 1, reset: false },
    { key: "almost", label: "🙂 Plutôt oui", delta: 0.5, reset: false },
    { key: "neutral", label: "😐 Neutre", delta: 0, reset: true },
    { key: "almost-no", label: "🤔 Plutôt non", delta: 0, reset: true },
    { key: "no", label: "❌ Non", delta: 0, reset: true }
  ];
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.addEventListener("click", () => rateCloze(id, option, panel, span));
    panel.appendChild(button);
  });
  return panel;
}

async function rateCloze(id, option, panel, span) {
  if (!state.currentPage || !state.currentCourse || !state.pseudo) return;
  const pageRef = doc(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages", state.currentPage.id);
  const current = normalizeClozeStateEntry(
    (state.currentPage.clozeStates || {})[id] || { answer: span.dataset.answer || "" }
  );
  const baseScore = option.reset ? 0 : Math.max(0, Number(current.score || 0));
  const newScore = option.reset
    ? 0
    : Number((baseScore + option.delta).toFixed(2));
  const newCounter = option.reset
    ? 0
    : Math.max(0, Math.floor(newScore));
  const newState = {
    answer: current.answer,
    counter: newCounter,
    score: newScore
  };
  try {
    await updateDoc(pageRef, {
      [`clozeStates.${id}`]: newState
    });
    state.currentPage.clozeStates = {
      ...state.currentPage.clozeStates,
      [id]: newState
    };
    state.currentClozeStates = {
      ...state.currentClozeStates,
      [id]: newState
    };
    state.currentPage.clozeStates = normalizeClozeStates(state.currentClozeStates);
    state.pages = state.pages.map((page) =>
      page.id === state.currentPage.id
        ? { ...page, clozeStates: normalizeClozeStates(state.currentPage.clozeStates) }
        : page
    );
    span.dataset.counter = newCounter;
    span.dataset.score = newScore;
    panel.remove();
    showToast("Réponse enregistrée", "success");
  } catch (error) {
    console.error(error);
    showToast("Erreur lors de l'évaluation", "error");
  }
}

async function runIteration() {
  if (!state.currentCourse || !state.pseudo) return;
  const confirmed = window.confirm("Lancer une nouvelle itération ?");
  if (!confirmed) return;
  try {
    const pagesRef = collection(db, "users", state.pseudo, "courses", state.currentCourse.id, "pages");
    const snapshot = await getDocs(pagesRef);
    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.clozeStates) return;
      const updated = {};
      Object.entries(data.clozeStates).forEach(([key, value]) => {
        const normalized = normalizeClozeStateEntry(value || {});
        const decremented = Math.max(0, Number((normalized.counter ?? 0) - 1));
        const maxCounter = Math.max(0, Math.floor(normalized.score));
        const counter = Math.min(maxCounter, decremented);
        updated[key] = {
          answer: normalized.answer,
          counter,
          score: normalized.score
        };
      });
      batch.update(docSnap.ref, { clozeStates: updated });
    });
    await batch.commit();
    if (state.currentPage) {
      const updated = {};
      Object.entries(state.currentPage.clozeStates || {}).forEach(([key, value]) => {
        const normalized = normalizeClozeStateEntry(value || {});
        const decremented = Math.max(0, Number((normalized.counter ?? 0) - 1));
        const maxCounter = Math.max(0, Math.floor(normalized.score));
        updated[key] = {
          answer: normalized.answer,
          counter: Math.min(maxCounter, decremented),
          score: normalized.score
        };
      });
      const normalizedCurrent = normalizeClozeStates(updated);
      state.currentPage = {
        ...state.currentPage,
        clozeStates: normalizedCurrent
      };
      state.currentClozeStates = normalizedCurrent;
      state.pages = state.pages.map((page) =>
        page.id === state.currentPage.id ? { ...page, clozeStates: normalizedCurrent } : page
      );
      ui.editor.querySelectorAll("span.cloze").forEach((span) => {
        const data = normalizedCurrent[span.dataset.id];
        if (data) {
          span.dataset.counter = String(data.counter);
          span.dataset.score = String(data.score);
        }
      });
      renderRevisionView();
    }
    showToast("Itération appliquée", "success");
  } catch (error) {
    console.error(error);
    showToast("Impossible d'appliquer l'itération", "error");
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
  ui.newCourseForm.addEventListener("submit", handleNewCourse);
  ui.backToDashboard.addEventListener("click", () => {
    showView("dashboard");
    if (state.pagesUnsubscribe) {
      state.pagesUnsubscribe();
      state.pagesUnsubscribe = null;
    }
    state.currentCourse = null;
    state.currentPage = null;
    state.pages = [];
    ui.pagesTree.innerHTML = "";
    ui.editor.innerHTML = "";
    ui.revisionContent.innerHTML = "";
    ui.courseTitle.textContent = "";
    ui.pageEmpty.classList.remove("hidden");
    togglePagePanels(false);
  });
  ui.addRootPage.addEventListener("click", handleAddRootPage);
  ui.addPageForm.addEventListener("submit", handleAddPage);
  editorToolbar.addEventListener("click", handleToolbarClick);
  ui.insertImageBtn.addEventListener("click", insertImage);
  ui.createClozeBtn.addEventListener("click", createCloze);
  ui.removeClozeBtn.addEventListener("click", removeCloze);
  ui.saveButton.addEventListener("click", savePage);
  ui.editorTab.addEventListener("click", () => switchToTab("editor"));
  ui.revisionTab.addEventListener("click", () => switchToTab("revision"));
  ui.newIterationBtn.addEventListener("click", runIteration);
}

initEvents();
initAuth();
