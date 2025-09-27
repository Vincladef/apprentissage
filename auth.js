import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
export async function signUp(auth, email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
}
export async function signIn(auth, email, password) {
    return signInWithEmailAndPassword(auth, email, password);
}
export async function resetPassword(auth, email) {
    return sendPasswordResetEmail(auth, email);
}
