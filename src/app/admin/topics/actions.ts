'use server';

import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { revalidatePath } from 'next/cache';

// Hardcoded user for now, this would come from an auth system.
const userId = 'anonymous_user';

const dummyTopics = [
    { id: '1', name: 'Travel', enabled: true },
    { id: '2', name: 'Food', enabled: true },
    { id: '3', name: 'Technology', enabled: false },
];

export async function getTopics() {
    return Promise.resolve(dummyTopics);
  /*
  const topicsSnapshot = await getDocs(
    collection(db, 'users', userId, 'topics')
  );
  const topics = topicsSnapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
    enabled: doc.data().enabled ?? false,
  }));
  return topics;
  */
}

export async function addTopic(topicName: string) {
  if (!topicName || topicName.trim() === '') {
    return { error: 'Topic name cannot be empty.' };
  }
  console.log(`(Not really) Adding topic: ${topicName}`);
  revalidatePath('/admin/topics');
  return { success: true };
  /*
  try {
    await addDoc(collection(db, 'users', userId, 'topics'), {
      name: topicName.trim(),
      enabled: true, // Newly added topics are enabled by default
    });
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error adding topic:', error);
    return { error: 'Failed to add topic.' };
  }
  */
}

export async function deleteTopic(topicId: string) {
    console.log(`(Not really) Deleting topic: ${topicId}`);
    revalidatePath('/admin/topics');
    return { success: true };
  /*
  try {
    await deleteDoc(doc(db, 'users', userId, 'topics', topicId));
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error deleting topic:', error);
    return { error: 'Failed to delete topic.' };
  }
  */
}

export async function toggleTopic(topicId: string, currentState: boolean) {
    console.log(`(Not really) Toggling topic ${topicId} from ${currentState}`);
    revalidatePath('/admin/topics');
    return { success: true };
  /*
  try {
    await updateDoc(doc(db, 'users', userId, 'topics', topicId), {
      enabled: !currentState,
    });
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error toggling topic:', error);
    return { error: 'Failed to update topic status.' };
  }
  */
}
