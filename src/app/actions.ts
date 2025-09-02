'use server';

// This file is being kept for user management but conversation logic has moved.
// Genkit flows are no longer directly called from here for the main conversation.

import {db} from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { getUser } from './admin/topics/actions';

export type Message = {
  sender: 'user' | 'ai';
  text: string;
  correction?: string;
  id: number;
};

// The core conversation logic now happens over WebSockets via server.ts
// The following functions can be removed or repurposed for other features
// like conversation history saving if needed, but they are not part of the
// real-time loop anymore.

export async function getRandomTopic(userId: string): Promise<string> {
  if (!userId) {
    const defaultTopics = [
      'General Conversation',
      'Travel',
      'Food',
      'Technology',
    ];
    return defaultTopics[Math.floor(Math.random() * defaultTopics.length)];
  }

  try {
    const topicsRef = collection(db, 'users', userId, 'topics');
    const q = query(topicsRef, where('enabled', '==', true));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 'General Conversation';
    }

    const enabledTopics = querySnapshot.docs.map(doc => doc.data().name);
    return enabledTopics[Math.floor(Math.random() * enabledTopics.length)];
  } catch (error) {
    console.error("Error fetching user's topics, using default. Error: ", error);
    const defaultTopics = [
      'General Conversation',
      'Travel',
      'Food',
      'Technology',
    ];
    return defaultTopics[Math.floor(Math.random() * defaultTopics.length)];
  }
}
