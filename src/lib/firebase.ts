import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAjUvuDPTKW2OsPCO4yYcnog8iqq3ULFFw",
  authDomain: "krypton-ide-915df.firebaseapp.com",
  projectId: "krypton-ide-915df",
  storageBucket: "krypton-ide-915df.firebasestorage.app",
  messagingSenderId: "868874217528",
  appId: "1:868874217528:web:749f42d87f0e1b2e9adecd",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
