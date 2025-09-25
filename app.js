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
    lastSavedAt: null
  };

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
    addNoteBtn: document.getElementById("add-note-btn"),
    notesContainer: document.getElementById("notes-container"),
    noteTitle: document.getElementById("note-title"),
    noteEditor: document.getElementById("note-editor"),
    saveStatus: document.getElementById("save-status"),
    editorWrapper: document.getElementById("editor-wrapper"),
    emptyState: document.getElementById("empty-note"),
    toast: document.getElementById("toast"),
    toolbar: document.querySelector(".editor-toolbar")
  };

  ui.logoutBtn.disabled = true;

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
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      });
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
    ui.editorWrapper.classList.add("hidden");
    ui.emptyState.classList.remove("hidden");
    ui.noteTitle.value = "";
    ui.noteEditor.innerHTML = "";
    updateSaveStatus();
  }

  function applyCurrentNoteToEditor() {
    if (!state.currentNote) {
      showEmptyEditor();
      return;
    }
    ui.emptyState.classList.add("hidden");
    ui.editorWrapper.classList.remove("hidden");
    ui.noteTitle.value = state.currentNote.title || "";
    ui.noteEditor.innerHTML = state.currentNote.contentHtml || "";
    state.lastSavedAt = state.currentNote.updatedAt instanceof Date ? state.currentNote.updatedAt : null;
    if (state.hasUnsavedChanges) {
      updateSaveStatus("dirty");
    } else {
      updateSaveStatus(state.lastSavedAt ? "saved" : "", state.lastSavedAt || null);
    }
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
        state.currentNote = { ...current };
        state.hasUnsavedChanges = false;
        applyCurrentNoteToEditor();
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
    applyCurrentNoteToEditor();
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
    state.currentNote.contentHtml = ui.noteEditor.innerHTML;
    state.hasUnsavedChanges = true;
    updateSaveStatus("dirty");
    scheduleSave();
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

  function handleToolbarClick(event) {
    const button = event.target.closest("button[data-command]");
    if (!button || !state.currentNote) return;
    const command = button.dataset.command;
    if (!command) return;
    const value = button.dataset.value || null;
    document.execCommand(command, false, value);
    ui.noteEditor.focus();
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
    ui.toolbar.addEventListener("click", handleToolbarClick);
    window.addEventListener("beforeunload", (event) => {
      if (state.hasUnsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }

  initEvents();
  initAuth();
}
