import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDiMTbZPv-CtDqJYwNijMJZya9Y3m7ubwU",
  authDomain: "krypton-ide-915df.firebaseapp.com",
  projectId: "krypton-ide-915df",
  storageBucket: "krypton-ide-915df.firebasestorage.app",
  messagingSenderId: "868874217528",
  appId: "1:868874217528:android:b2c8b4137688b6b39adecd",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.appdata');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
