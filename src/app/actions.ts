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
    // The AI should subtly correct grammar within its response.
    // We will get the correction for the *user's last message* and feed it to the AI.
    
    const historyLines = conversationHistory.split('\n');
    const lastUserMessage = historyLines[historyLines.length - 1];

    if(lastUserMessage.startsWith("Student: ")) {
      const userText = lastUserMessage.substring("Student: ".length);
      const correctionResult = await getGrammarCorrection({ text: userText });
      
      // If a correction exists, rephrase the AI's response to incorporate it.
      // This is a simplified approach. A more advanced implementation would adjust the next question.
      if (correctionResult.correctedText.toLowerCase() !== userText.toLowerCase()) {
         const rephrasingPrompt = `As an AI language assistant, your student said: "${userText}". A better way to say that is: "${correctionResult.correctedText}". Your planned next question is: "${result.nextQuestion}". Rephrase your next question to naturally and subtly model the corrected grammar without explicitly saying "you should say". For example, if the student says "I go to store" and you planned to ask "What did you buy?", you could instead say "Oh, you went to the store? What did you buy?"`;
        // For now, we will just return the original question as rephrasing logic can be complex.
        // This is a placeholder for a more advanced implementation.
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
    // Avoid sending very short or empty strings to the API
    if (!text || text.trim().length < 5) {
      return { correctedText: text };
    }
    const result = await correctGrammar({ text });
    return result;
  } catch (error) {
    console.error('Error in getGrammarCorrection:', error);
    // On error, return the original text to avoid disrupting the user flow
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
