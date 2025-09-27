import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  type Auth,
  type UserCredential,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

export async function signUp(auth: Auth, email: string, password: string): Promise<UserCredential> {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function signIn(auth: Auth, email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function resetPassword(auth: Auth, email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}
