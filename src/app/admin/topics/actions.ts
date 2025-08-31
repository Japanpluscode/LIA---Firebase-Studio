'use server';

import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
} from 'firebase/firestore';
import { revalidatePath } from 'next/cache';

export async function getTopics() {
  const topicsSnapshot = await getDocs(collection(db, 'topics'));
  const topics = topicsSnapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
  }));
  return topics;
}

export async function addTopic(topicName: string) {
  if (!topicName || topicName.trim() === '') {
    return { error: 'Topic name cannot be empty.' };
  }
  try {
    await addDoc(collection(db, 'topics'), {
      name: topicName.trim(),
    });
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error adding topic:', error);
    return { error: 'Failed to add topic.' };
  }
}

export async function deleteTopic(topicId: string) {
  try {
    await deleteDoc(doc(db, 'topics', topicId));
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error deleting topic:', error);
    return { error: 'Failed to delete topic.' };
  }
}
