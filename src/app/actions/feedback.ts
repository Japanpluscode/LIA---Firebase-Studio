'use server';

import { clientDb as db } from '@/lib/firebase-client';
import { collection, addDoc } from 'firebase/firestore';

interface ConversationFeedback {
  userId: string;
  userName: string;
  feedback: string;
  topics: string[];
  duration: number;
  date: string;
}

export async function saveConversationFeedback(data: ConversationFeedback) {
  try {
    console.log('💾 Saving feedback to Firestore:', data);
    
    // Save to conversations collection under user
    const conversationRef = await addDoc(
      collection(db, 'users', data.userId, 'conversations'),
      {
        userName: data.userName,
        feedback: data.feedback,
        topics: data.topics,
        duration: data.duration,
        date: data.date,
        timestamp: new Date().toISOString(),
      }
    );

    console.log('✅ Feedback saved successfully:', conversationRef.id);
    return { success: true, id: conversationRef.id };
  } catch (error) {
    console.error('❌ Error saving feedback:', error);
    throw new Error(`Failed to save feedback: ${error}`);
  }
}