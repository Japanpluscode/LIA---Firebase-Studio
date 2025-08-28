'use server';

import { dynamicQuestionSelection } from '@/ai/flows/dynamic-question-selection';
import { correctGrammar } from '@/ai/flows/grammar-correction';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type Message = {
  sender: 'user' | 'ai';
  text: string;
  correction?: string;
  id: number;
};

export async function getAiResponse(topic: string, conversationHistory: string) {
  try {
    const result = await dynamicQuestionSelection({ topic, conversationHistory });
    return result.nextQuestion;
  } catch (error) {
    console.error('Error in getAiResponse:', error);
    return 'I seem to be having trouble thinking. Could you try that again?';
  }
}

export async function getGrammarCorrection(text: string) {
  try {
    // Avoid sending very short or empty strings to the API
    if (!text || text.trim().length < 5) {
      return text;
    }
    const result = await correctGrammar({ text });
    return result.correctedText;
  } catch (error) {
    console.error('Error in getGrammarCorrection:', error);
    // On error, return the original text to avoid disrupting the user flow
    return text;
  }
}

export async function saveConversation(
  userId: string,
  topic: string,
  messages: Message[]
) {
  try {
    await addDoc(collection(db, 'conversations'), {
      userId,
      topic,
      // We map over messages to remove the 'id' field, which is a React key and not needed in the database.
      messages: messages.map(({ id, ...rest }) => rest),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Log the error for debugging but don't throw it to the client to avoid a poor user experience.
    console.error('Error saving conversation:', error);
  }
}
