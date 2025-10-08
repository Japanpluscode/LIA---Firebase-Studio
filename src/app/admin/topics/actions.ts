'use server';

import { getDB } from '@/lib/firebase';

const db = getDB();

// Export types
export type User = {
  id: string;
  name: string;
  email: string;
  profile?: string;
  createdAt: string;
};

export type Topic = {
  id: string;
  name: string;
  enabled: boolean;
  createdAt?: string;
};

export async function getTopics(userId: string): Promise<Topic[]> {
  try {
    const topicsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .get();

    return topicsSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      enabled: doc.data().enabled,
      createdAt: doc.data().createdAt
    }));
  } catch (error) {
    console.error('Error fetching topics:', error);
    return [];
  }
}

export async function addTopic(userId: string, topicName: string) {
  try {
    const topicRef = await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .add({
        name: topicName,
        enabled: true,
        createdAt: new Date().toISOString()
      });

    return { success: true, id: topicRef.id };
  } catch (error) {
    console.error('Error adding topic:', error);
    return { success: false, error: 'Failed to add topic' };
  }
}

export async function deleteTopic(userId: string, topicId: string) {
  try {
    await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .doc(topicId)
      .delete();

    return { success: true };
  } catch (error) {
    console.error('Error deleting topic:', error);
    return { success: false, error: 'Failed to delete topic' };
  }
}

export async function toggleTopic(userId: string, topicId: string, enabled: boolean) {
  try {
    await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .doc(topicId)
      .update({ enabled });

    return { success: true };
  } catch (error) {
    console.error('Error toggling topic:', error);
    return { success: false, error: 'Failed to toggle topic' };
  }
}

export async function getUsers(): Promise<User[]> {
  try {
    const usersSnapshot = await db.collection('users').get();
    return usersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      email: doc.data().email,
      profile: doc.data().profile,
      createdAt: doc.data().createdAt
    }));
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export async function addUser(name: string, email: string, profile: string) {
  try {
    const userRef = await db.collection('users').add({
      name,
      email,
      profile,
      createdAt: new Date().toISOString()
    });

    // Return the newly created user
    const newUser: User = {
      id: userRef.id,
      name,
      email,
      profile,
      createdAt: new Date().toISOString()
    };

    return { success: true, id: userRef.id, newUser };
  } catch (error) {
    console.error('Error adding user:', error);
    return { success: false, error: 'Failed to add user' };
  }
}

export async function getUser(userId: string): Promise<User | null> {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return null;
    }
    const data = userDoc.data();
    return {
      id: userDoc.id,
      name: data?.name || '',
      email: data?.email || '',
      profile: data?.profile,
      createdAt: data?.createdAt || ''
    };
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const usersSnapshot = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return null;
    }

    const userDoc = usersSnapshot.docs[0];
    const data = userDoc.data();
    return {
      id: userDoc.id,
      name: data?.name || '',
      email: data?.email || '',
      profile: data?.profile,
      createdAt: data?.createdAt || ''
    };
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
}