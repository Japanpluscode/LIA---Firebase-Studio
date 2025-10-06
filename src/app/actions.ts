'use server';

// This file is being kept for user management but conversation logic has moved.
// Genkit flows are no longer directly called from here for the main conversation.

import { db } from '@/lib/firebase';
import { getUser } from './admin/topics/actions';

export type Message = {
  sender: 'user' | 'ai';
  text: string;
  correction?: string;
  id: number;
};

// The core conversation logic now happens over WebSockets via server.ts

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
    // Admin SDK syntax
    const topicsRef = db.collection('users').doc(userId).collection('topics');
    const querySnapshot = await topicsRef.where('enabled', '==', true).get();

    if (querySnapshot.empty) {
      return 'General Conversation';
    }

    const enabledTopics = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return data.name as string;
    });
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