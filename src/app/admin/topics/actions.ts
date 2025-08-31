'use server';

import {db} from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import {revalidatePath} from 'next/cache';

export async function getUsers() {
  try {
    const usersCollection = collection(db, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as {id: string; name: string; email: string; profile: string}[];
    return users;
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

export async function getUser(userId: string) {
   try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() } as {id: string, name: string, email: string, profile: string};
    }
    return null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email.toLowerCase()));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      return { id: userDoc.id, ...userDoc.data() } as {id: string, name: string, email: string, profile: string};
    }
    return null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}


export async function addUser(name: string, email: string, profile: string) {
  if (!name || name.trim() === '' || !email || email.trim() === '') {
    return {error: 'User name and email cannot be empty.'};
  }
  // Check if user with email already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return { error: 'A user with this email already exists.' };
  }

  try {
    const docRef = await addDoc(collection(db, 'users'), {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      profile: profile.trim(),
    });
    revalidatePath('/admin/topics');
    return {success: true, newUser: {id: docRef.id, name: name.trim(), email: email.trim().toLowerCase(), profile: profile.trim()}};
  } catch (error) {
    console.error('Error adding user:', error);
    return {error: 'Failed to add user.'};
  }
}

export async function getTopics(userId: string) {
  try {
    const topicsCollection = collection(db, 'users', userId, 'topics');
    const topicsSnapshot = await getDocs(topicsCollection);
    const topics = topicsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as {id: string; name: string; enabled: boolean}[];
    return topics;
  } catch (error) {
    console.error('Error getting topics:', error);
    return [];
  }
}

export async function addTopic(userId: string, topicName: string) {
  if (!userId || !topicName || topicName.trim() === '') {
    return {error: 'User ID and topic name cannot be empty.'};
  }
  try {
    await addDoc(collection(db, 'users', userId, 'topics'), {
      name: topicName.trim(),
      enabled: true,
    });
    revalidatePath('/admin/topics');
    return {success: true};
  } catch (error) {
    console.error('Error adding topic:', error);
    return {error: 'Failed to add topic.'};
  }
}

export async function deleteTopic(userId: string, topicId: string) {
  try {
    await deleteDoc(doc(db, 'users', userId, 'topics', topicId));
    revalidatePath('/admin/topics');
    return {success: true};
  } catch (error) {
    console.error('Error deleting topic:', error);
    return {error: 'Failed to delete topic.'};
  }
}

export async function toggleTopic(
  userId: string,
  topicId: string,
  currentState: boolean
) {
  try {
    const topicRef = doc(db, 'users', userId, 'topics', topicId);
    await updateDoc(topicRef, {
      enabled: !currentState,
    });
    revalidatePath('/admin/topics');
    return {success: true};
  } catch (error) {
    console.error('Error toggling topic:', error);
    return {error: 'Failed to update topic status.'};
  }
}
