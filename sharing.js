import { collection, getDocs, query, where, updateDoc, serverTimestamp, } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
const SHARE_ROLE_VIEWER = "viewer";
const SHARE_ROLE_EDITOR = "editor";
const SHARE_ROLES = new Set([SHARE_ROLE_VIEWER, SHARE_ROLE_EDITOR]);
function normalizeShareRole(role) {
    if (typeof role === "string") {
        const normalized = role.trim().toLowerCase();
        if (SHARE_ROLES.has(normalized)) {
            return normalized;
        }
    }
    return SHARE_ROLE_VIEWER;
}
async function findProfileUidByEmail(noteRef, email) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
        throw new Error("Une adresse e-mail valide est requise pour partager la fiche.");
    }
    const firestore = noteRef.firestore;
    const profilesRef = collection(firestore, "profiles");
    const queries = [normalizedEmail];
    const lower = normalizedEmail.toLowerCase();
    if (lower !== normalizedEmail) {
        queries.push(lower);
    }
    for (const candidate of queries) {
        const snapshot = await getDocs(query(profilesRef, where("email", "==", candidate)));
        const docSnap = snapshot.docs[0];
        if (docSnap) {
            return docSnap.id;
        }
    }
    throw new Error("Aucun profil ne correspond à cette adresse e-mail.");
}
export async function shareNoteByEmail(noteRef, email, role) {
    const targetRole = normalizeShareRole(role);
    const uid = await findProfileUidByEmail(noteRef, email);
    await updateDoc(noteRef, {
        [`members.${uid}`]: targetRole,
        updatedAt: serverTimestamp(),
    });
    return { uid, role: targetRole };
}
