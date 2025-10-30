'use server';

import { clientDb as db } from '@/lib/firebase-client';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where
} from 'firebase/firestore';

export interface Topic {
  id: string;
  name: string;
  enabled: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  profile: string;
  conversationDuration: number; // NEW: in minutes
  conversationInstructions: string; // NEW: custom instructions for L.I.A.
}

export async function getUsers() {
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const users: User[] = [];
    
    usersSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      users.push({
        id: docSnap.id,
        name: data.name || '',
        email: data.email || '',
        profile: data.profile || '',
        conversationDuration: data.conversationDuration || 5, // Default 5 minutes
        conversationInstructions: data.conversationInstructions || ''
      });
    });
    
    return users;
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

export async function getUser(userId: string) {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    
    const data = userDoc.data();
    return {
      id: userDoc.id,
      name: data.name || '',
      email: data.email || '',
      profile: data.profile || '',
      conversationDuration: data.conversationDuration || 5, // Default 5 minutes
      conversationInstructions: data.conversationInstructions || ''
    };
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) return null;
    
    const userDoc = querySnapshot.docs[0];
    const data = userDoc.data();
    return {
      id: userDoc.id,
      name: data.name || '',
      email: data.email || '',
      profile: data.profile || '',
      conversationDuration: data.conversationDuration || 5,
      conversationInstructions: data.conversationInstructions || ''
    };
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

export async function addUser(
  name: string, 
  email: string, 
  profile: string,
  conversationDuration: number = 5,
  conversationInstructions: string = ''
) {
  try {
    const userRef = doc(collection(db, 'users'));
    await setDoc(userRef, {
      name,
      email,
      profile,
      conversationDuration,
      conversationInstructions,
      createdAt: new Date().toISOString()
    });
    return userRef.id;
  } catch (error) {
    console.error('Error adding user:', error);
    throw error;
  }
}

export async function updateUser(
  userId: string, 
  name: string, 
  email: string, 
  profile: string,
  conversationDuration: number,
  conversationInstructions: string
) {
  try {
    await updateDoc(doc(db, 'users', userId), {
      name,
      email,
      profile,
      conversationDuration,
      conversationInstructions,
      updatedAt: new Date().toISOString()
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating user:', error);
    return { success: false, error: String(error) };
  }
}

export async function getTopics(userId: string) {
  try {
    const topicsSnapshot = await getDocs(
      collection(db, 'users', userId, 'topics')
    );
    
    const topics: Topic[] = [];
    topicsSnapshot.forEach((docSnap) => {
      topics.push({
        id: docSnap.id,
        name: docSnap.data().name,
        enabled: docSnap.data().enabled ?? true
      });
    });
    
    return topics;
  } catch (error) {
    console.error('Error getting topics:', error);
    return [];
  }
}

export async function addTopic(userId: string, topicName: string) {
  try {
    const topicRef = doc(collection(db, 'users', userId, 'topics'));
    
    await setDoc(topicRef, {
      name: topicName,
      enabled: true,
      createdAt: new Date().toISOString()
    });
    
    return topicRef.id;
  } catch (error) {
    console.error('Error adding topic:', error);
    throw error;
  }
}

export async function deleteTopic(userId: string, topicId: string) {
  try {
    await deleteDoc(doc(db, 'users', userId, 'topics', topicId));
    return { success: true };
  } catch (error) {
    console.error('Error deleting topic:', error);
    return { success: false, error: String(error) };
  }
}

export async function toggleTopic(userId: string, topicId: string, enabled: boolean) {
  try {
    await updateDoc(doc(db, 'users', userId, 'topics', topicId), { enabled });
    return { success: true };
  } catch (error) {
    console.error('Error toggling topic:', error);
    return { success: false, error: String(error) };
  }
}