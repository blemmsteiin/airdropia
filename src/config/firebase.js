import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyCxkq6W05pa3tdxE4hmIw4BYE9oN4t1f0Q",
  authDomain: "airdropbgy.firebaseapp.com",
  projectId: "airdropbgy",
  storageBucket: "airdropbgy.firebasestorage.app",
  messagingSenderId: "394122331080",
  appId: "1:394122331080:web:83b6fe6862298c240fb6fd",
  measurementId: "G-0DBLFNXJLJ"
};

const app = initializeApp(firebaseConfig);

// React Native için özel Auth yapılandırması (Kalıcı oturum için)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);
