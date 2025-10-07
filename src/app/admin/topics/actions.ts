'use server';

import { db } from '@/lib/firebase';
import { revalidatePath } from 'next/cache';

export type User = {
  id: string;
  name: string;
  email: string;
  profile: string;
};

export async function getUsers(): Promise<User[]> {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name || '',
      email: doc.data().email || '',
      profile: doc.data().profile || '',
    }));
    return users;
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

export async function getUser(userId: string): Promise<User | null> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      return {
        id: userDoc.id,
        name: data?.name || '',
        email: data?.email || '',
        profile: data?.profile || '',
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    
    const querySnapshot = await db
      .collection('users')
      .where('email', '==', normalizedEmail)
      .get();

    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const data = userDoc.data();
      return {
        id: userDoc.id,
        name: data.name || '',
        email: data.email || '',
        profile: data.profile || '',
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}

export async function addUser(
  name: string,
  email: string,
  profile: string
): Promise<{ success?: boolean; newUser?: User; error?: string }> {
  if (!name || name.trim() === '' || !email || email.trim() === '') {
    return { error: 'User name and email cannot be empty.' };
  }

  // Check if user with email already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    return { error: 'A user with this email already exists.' };
  }

  try {
    const newUser = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      profile: profile.trim(),
    };

    const docRef = await db.collection('users').add(newUser);
    revalidatePath('/admin/topics');
    return { success: true, newUser: { id: docRef.id, ...newUser } };
  } catch (error) {
    console.error('Error adding user:', error);
    return { error: 'Failed to add user.' };
  }
}

export async function getTopics(
  userId: string
): Promise<Array<{ id: string; name: string; enabled: boolean }>> {
  try {
    const topicsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .get();

    const topics = topicsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        enabled: data.enabled === true,
      };
    });
    return topics;
  } catch (error) {
    console.error('Error getting topics:', error);
    return [];
  }
}

export async function addTopic(
  userId: string,
  topicName: string
): Promise<{ success?: boolean; error?: string }> {
  if (!userId || !topicName || topicName.trim() === '') {
    return { error: 'User ID and topic name cannot be empty.' };
  }

  try {
    await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .add({
        name: topicName.trim(),
        enabled: true,
      });
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error adding topic:', error);
    return { error: 'Failed to add topic.' };
  }
}

export async function deleteTopic(
  userId: string,
  topicId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .doc(topicId)
      .delete();
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error deleting topic:', error);
    return { error: 'Failed to delete topic.' };
  }
}

export async function toggleTopic(
  userId: string,
  topicId: string,
  currentState: boolean
): Promise<{ success?: boolean; error?: string }> {
  try {
    await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .doc(topicId)
      .update({
        enabled: !currentState,
      });
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error toggling topic:', error);
    return { error: 'Failed to update topic status.' };
  }
}