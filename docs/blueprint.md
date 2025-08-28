# **App Name**: L.I.A. - Language Immersion AI

## Core Features:

- Central Avatar Button: Central circular button with student's avatar. Pulsing animation to indicate AI is 'speaking'.
- Conversational AI Persona: AI persona L.I.A. should be friendly, encouraging, and conversational.
- AI Grammar Correction: LLM-powered subtle grammar correction of the user's utterances.
- Dynamic Question Selection: Tool that dynamically chooses a new question from the current conversation topic and then presents it to the user.
- Topic Management: Admin view or Firestore collection to add, remove, and edit conversational topics.
- Conversation History: Cloud Firestore storage of the conversation history including the full transcript, date, time, and topic for each student, each identified via Firebase Authentication.
- Student Authentication: Firebase Authentication for individual student sessions

## Style Guidelines:

- Primary color: Dark blue (#003399), taken from the logo's primary color, to create a focused learning environment.
- Secondary color: Red (#CC0000), taken from the logo's secondary color, to highlight key interactive elements.
- Background color: Light gray (#F0F0F0) to maintain a clean, uncluttered, and gentle aesthetic.
- Font: 'PT Sans', a humanist sans-serif. Suitable for both headlines and body text.
- Clean, minimalist layout optimized for audio-first experience.
- Use simple, intuitive icons. Focus on high contrast to ensure clarity.
- Pulsing animation for the central button when the AI is providing feedback.