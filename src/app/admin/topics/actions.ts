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

// Placeholder data since Firestore is not connected
let placeholderTopics = [
  { id: '1', name: 'Travel', enabled: true },
  { id: '2', name: 'Food', enabled: true },
  { id: '3', name: 'Hobbies', enabled: false },
];

export async function getTopics() {
  // Return placeholder data instead of calling Firestore
  return placeholderTopics;
}

export async function addTopic(topicName: string) {
  if (!topicName || topicName.trim() === '') {
    return { error: 'Topic name cannot be empty.' };
  }
  try {
    // Add to placeholder data
    const newTopic = {
      id: (placeholderTopics.length + 1).toString(),
      name: topicName.trim(),
      enabled: true,
    };
    placeholderTopics.push(newTopic);
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error adding topic:', error);
    return { error: 'Failed to add topic.' };
  }
}

export async function deleteTopic(topicId: string) {
  try {
    // Delete from placeholder data
    placeholderTopics = placeholderTopics.filter(topic => topic.id !== topicId);
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error deleting topic:', error);
    return { error: 'Failed to delete topic.' };
  }
}

export async function toggleTopic(topicId: string, currentState: boolean) {
  try {
    // Update placeholder data
    const topic = placeholderTopics.find(topic => topic.id === topicId);
    if (topic) {
      topic.enabled = !currentState;
    }
    revalidatePath('/admin/topics');
    return { success: true };
  } catch (error) {
    console.error('Error toggling topic:', error);
    return { error: 'Failed to update topic status.' };
  }
}