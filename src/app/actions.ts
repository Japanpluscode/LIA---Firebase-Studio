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
  orderBy,
  limit,
} from 'firebase/firestore';

export type Message = {
  sender: 'user' | 'ai';
  text: string;
  correction?: string;
  id: number;
};

export async function getAiResponse(userId: string, topic: string, messages: Message[]) {
  try {
    const conversationHistory = messages
      .map((msg) => `${msg.sender === 'user' ? 'Student' : 'L.I.A.'}: ${msg.text}`)
      .join('\n');

    // Fetch past conversation summaries to provide context
    const conversationsRef = collection(db, 'users', userId, 'conversations');
    const q = query(conversationsRef, orderBy('createdAt', 'desc'), limit(5));
    const querySnapshot = await getDocs(q);
    const pastConversations = querySnapshot.docs.map(doc => {
      const data = doc.data();
      // Combine messages to a string summary
      return `On ${data.createdAt.toDate().toLocaleDateString()} about ${data.topic}: ${data.messages.map((m: any) => m.text).join(' ')}`;
    }).join('\n\n');

    const result = await dynamicQuestionSelection({
      topic,
      conversationHistory,
      studentContext: pastConversations,
    });

    const lastUserMessage = messages[messages.length - 1];
    
    if (lastUserMessage && lastUserMessage.sender === 'user') {
      const userText = lastUserMessage.text;
      const correctionResult = await getGrammarCorrection(userText);

      if (
        correctionResult.correctedText.toLowerCase() !== userText.toLowerCase()
      ) {
         // The rephrasing logic can be complex, for now we will just use the correction as a potential field in the message.
      }
    }

    return result.nextResponse;
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
  if (!messages || messages.length === 0 || !userId || userId === 'anonymous_user') {
    console.log('Skipping save for anonymous or empty conversation.');
    return;
  }
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
      messages: messages.map(({ id, ...rest }) => rest), // Remove client-side ID
      feedback: feedbackResult.feedback,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error saving conversation:', error);
  }
}

export async function getRandomTopic(userId: string): Promise<string> {
    if (!userId || userId === 'anonymous_user') {
        const defaultTopics = ['General Conversation', 'Travel', 'Food', 'Technology'];
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
        const defaultTopics = ['General Conversation', 'Travel', 'Food', 'Technology'];
        return defaultTopics[Math.floor(Math.random() * defaultTopics.length)];
    }
}