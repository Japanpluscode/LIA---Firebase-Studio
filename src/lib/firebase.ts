import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let app: App | undefined;
let firestoreInstance: Firestore | undefined;

function initializeFirebaseAdmin(): App {
  if (!app) {
    const apps = getApps();
    if (apps.length > 0) {
      app = apps[0] as App;
    } else {
      // Only initialize if we have the required credentials
      if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 
          !process.env.FIREBASE_CLIENT_EMAIL || 
          !process.env.FIREBASE_PRIVATE_KEY) {
        throw new Error('Missing Firebase Admin credentials. Please set NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY environment variables.');
      }

      app = initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
  }
  return app;
}

export function getDB(): Firestore {
  if (!firestoreInstance) {
    const adminApp = initializeFirebaseAdmin();
    firestoreInstance = getFirestore(adminApp);
  }
  return firestoreInstance;
}