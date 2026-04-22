// Import the Firebase modules that you need in your app
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// Firebase configuration object
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_AUTH_DOMAIN',
  databaseURL: 'YOUR_DATABASE_URL',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_STORAGE_BUCKET',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and Database
const auth = getAuth(app);
const database = getDatabase(app);

// Export the auth and database services
export { auth, database };

// Helper function to fetch users
export const fetchUsers = async () => {
  const usersRef = ref(database, 'users');
  const snapshot = await get(usersRef);
  return snapshot.val();
};

// Helper function to add or update a user
export const saveUser = async (userId, userData) => {
  const userRef = ref(database, `users/${userId}`);
  await set(userRef, userData);
};

// Helper function to subscribe to user changes in real-time
export const subscribeToUserChanges = (userId, callback) => {
  const userRef = ref(database, `users/${userId}`);
  onValue(userRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};
