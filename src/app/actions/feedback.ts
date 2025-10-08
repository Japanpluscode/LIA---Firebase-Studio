'use server';

import { getDB } from '@/lib/firebase';

export async function saveConversationFeedback(data: {
  userId: string;
  userName: string;
  feedback: string;
  topics: string[];
  duration: number;
  date: string;
}) {
  try {
    const db = getDB();
    const feedbackRef = db.collection('users').doc(data.userId).collection('conversations');
    
    await feedbackRef.add({
      userName: data.userName,
      feedback: data.feedback,
      topics: data.topics,
      duration: data.duration,
      date: data.date,
      createdAt: new Date().toISOString()
    });

    console.log('✅ Feedback saved successfully');
    return { success: true };
  } catch (error) {
    console.error('❌ Error saving feedback:', error);
    return { success: false, error: 'Failed to save feedback' };
  }
}