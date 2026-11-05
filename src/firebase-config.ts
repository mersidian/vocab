/**
 * Firebase web config. These values are not secrets: access is controlled by
 * firestore.rules, which only lets OWNER_EMAIL read or write.
 *
 * Leave `apiKey` empty to run in local mode (progress kept in this browser only).
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyC3irM47rVPbyMVIjimSN2MH1_9xHuhMOg',
  authDomain: 'mersidian-vocap.firebaseapp.com',
  projectId: 'mersidian-vocap',
  storageBucket: 'mersidian-vocap.firebasestorage.app',
  messagingSenderId: '498938667963',
  appId: '1:498938667963:web:0639de08a236994a135a9e',
}

export const OWNER_EMAIL = 'mersidian@gmail.com'
