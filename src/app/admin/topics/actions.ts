'use server';

import { getDB } from '@/lib/firebase';

const db = getDB();

export async function getTopics(userId: string) {
  try {
    const topicsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('topics')
      .get();

    return topicsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
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

export async function getUsers() {
  try {
    const usersSnapshot = await db.collection('users').get();
    return usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
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

    return { success: true, id: userRef.id };
  } catch (error) {
    console.error('Error adding user:', error);
    return { success: false, error: 'Failed to add user' };
  }
}

export async function getUser(userId: string) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return null;
    }
    return {
      id: userDoc.id,
      ...userDoc.data()
    };
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export async function getUserByEmail(email: string) {
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
    return {
      id: userDoc.id,
      ...userDoc.data()
    };
  } catch (error) {
    console.error('Error fetching user by email:', error);
    return null;
  }
}