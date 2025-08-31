'use server';

import { dynamicQuestionSelection } from '@/ai/flows/dynamic-question-selection';
import { correctGrammar } from '@/ai/flows/grammar-correction';
import { generateFeedback } from '@/ai/flows/generate-feedback';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

export type Message = {
  sender: 'user' | 'ai';
  text: string;
  correction?: string;
  id: number;
};

export async function getAiResponse(topic: string, conversationHistory: string) {
  try {
    const result = await dynamicQuestionSelection({ topic, conversationHistory });

    const historyLines = conversationHistory.split('\n');
    const lastUserMessage = historyLines[historyLines.length - 1];

    if (lastUserMessage.startsWith('Student: ')) {
      const userText = lastUserMessage.substring('Student: '.length);
      const correctionResult = await getGrammarCorrection(userText);

      if (
        correctionResult.correctedText.toLowerCase() !== userText.toLowerCase()
      ) {
        const rephrasingPrompt = `As an AI language assistant, your student said: "${userText}". A better way to say that is: "${correctionResult.correctedText}". Your planned next question is: "${result.nextQuestion}". Rephrase your next question to naturally and subtly model the corrected grammar without explicitly saying "you should say". For example, if the student says "I go to store" and you planned to ask "What did you buy?", you could instead say "Oh, you went to the store? What did you buy?"`;
        // For now, we will just return the original question as rephrasing logic can be complex.
      }
    }

    return result.nextQuestion;
  } catch (error) {
    console.error('Error in getAiResponse:', error);
    return 'I seem to be having trouble thinking. Could you try that again?';
  }
}

export async function getGrammarCorrection(text: string) {
  try {
    if (!text || text.trim().length < 5) {
      return { correctedText: text };
    }
    const result = await correctGrammar({ text });
    return result;
  } catch (error) {
    console.error('Error in getGrammarCorrection:', error);
    return { correctedText: text };
  }
}

export async function saveConversation(
  userId: string,
  topic: string,
  messages: Message[]
) {
  if (!messages || messages.length === 0) return;
  try {
    const conversationHistory = messages
      .map(msg => `${msg.sender === 'user' ? 'Student' : 'L.I.A.'}: ${msg.text}`)
      .join('\n');

    const feedbackResult = await generateFeedback({
      topic,
      conversationHistory,
    });

    await addDoc(collection(db, 'users', userId, 'conversations'), {
      topic,
      messages: messages.map(({ id, ...rest }) => rest),
      feedback: feedbackResult.feedback,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error saving conversation:', error);
  }
}

export async function getRandomTopic(): Promise<string> {
  const defaultTopics = ['General Conversation', 'Travel', 'Food'];
  return defaultTopics[Math.floor(Math.random() * defaultTopics.length)];
  /*
  const defaultTopic = 'General Conversation';
  try {
    // Hardcoded user for now, this would come from an auth system.
    const userId = 'anonymous_user';
    const topicsRef = collection(db, 'users', userId, 'topics');
    const q = query(topicsRef, where('enabled', '==', true));

    const topicsSnapshot = await getDocs(q);

    if (topicsSnapshot.empty) {
      // If no enabled topics, check for any topics at all
      const allTopicsSnapshot = await getDocs(topicsRef);
      if (allTopicsSnapshot.empty) {
        // If no topics exist for the user, create a default one
        await addDoc(topicsRef, { name: defaultTopic, enabled: true });
        return defaultTopic;
      }
      return defaultTopic; // Return default if no topics are enabled
    }

    const topics = topicsSnapshot.docs.map(doc => doc.data().name);
    return topics[Math.floor(Math.random() * topics.length)];
  } catch (error) {
    console.error('Error fetching topics:', error);
    return defaultTopic;
  }
  */
}
