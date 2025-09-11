// src/server.ts - Complete Final Server with Personalized, Encouraging AI
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';
import minimist from 'minimist';

// Load environment variables
config();

// Parse command-line arguments
const args = minimist(process.argv.slice(2));

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(args.port || process.env.PORT || '3000', 10);
const hostname = args.hostname || process.env.HOSTNAME || '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Validate required environment variables
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ Error: Missing GEMINI_API_KEY environment variable');
  process.exit(1);
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_LIVE_API_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent';

// Import Firebase functions
import { db } from './lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

// Function to get user's enabled topics
async function getUserEnabledTopics(userId: string): Promise<string[]> {
  try {
    const topicsCollection = collection(db, 'users', userId, 'topics');
    const topicsSnapshot = await getDocs(topicsCollection);
    const topics = topicsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as {id: string; name: string; enabled: boolean}[];
    
    const enabledTopics = topics.filter(topic => topic.enabled).map(topic => topic.name);
    return enabledTopics;
  } catch (error) {
    console.error('Error fetching user topics:', error);
    return [];
  }
}

// Function to get complete user data (name + topics)
async function getUserData(userId: string): Promise<{name: string, topics: string[]}> {
  try {
    // Get user name
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userName = userDoc.exists() ? userDoc.data().name : 'there';
    
    // Get enabled topics
    const topics = await getUserEnabledTopics(userId);
    
    return { name: userName, topics };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { name: 'there', topics: [] };
  }
}

// Improved system instruction for L.I.A.
const SYSTEM_INSTRUCTION = `You are L.I.A. (Language Immersion AI), a warm and encouraging English conversation partner for Brazilian students. You're like a supportive friend who happens to speak perfect English.

PERSONALITY & APPROACH:
- Always use the student's name when speaking to them - it makes conversations personal and friendly
- Be genuinely encouraging and positive - celebrate every attempt, no matter how small
- NEVER criticize, judge, or point out mistakes directly
- Speak like a patient friend, not a teacher
- Keep the mood light and conversational
- Show genuine interest in what they're sharing

LANGUAGE SUPPORT FOR PORTUGUESE SPEAKERS:
- When they use Portuguese words, casually include the English word in your response: "Ah, you mean the beach! I love beaches too..."
- If they ask "como se diz..." simply give the word and continue the conversation naturally
- When they mix languages, just flow with it and respond in English
- Help with vocabulary by using new words in context, not by explaining grammar rules

CONVERSATION STYLE:
- Use simple, everyday English - like texting a friend
- Keep responses SHORT (1-2 sentences max) since this is voice conversation
- Ask one easy follow-up question to keep them talking
- Use casual expressions: "That's cool!", "Really?", "Nice!"
- Avoid formal language or complex vocabulary
- NO grammar corrections - just model correct usage naturally in your response

ENCOURAGEMENT TECHNIQUES:
- "You're doing great with your English!"
- "I love hearing about that!"
- "Your English is getting better!"
- "That's so interesting!"
- Use their name often: "That sounds fun, [name]!"

MULTILINGUAL UNDERSTANDING:
- Accept Portuguese words naturally - don't make them feel bad about it
- Smoothly provide English alternatives without stopping the conversation flow
- Treat code-switching as completely normal and expected

VOICE CONVERSATION RULES:
- This is SPOKEN conversation - be natural and flowing
- Avoid long explanations or lists
- Use contractions and casual speech patterns
- Pause naturally between thoughts
- Sound like you're genuinely enjoying the chat

Remember: Your goal is to make them WANT to keep practicing English because talking with you feels good and natural!`;

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Handle CORS for development
    if (dev) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    // Health check endpoint
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        features: ['gemini-native-audio', 'personalized-conversations', 'topic-filtering', 'multilingual-support']
      }));
      return;
    }

    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ 
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 10 * 1024 * 1024, // 10MB for audio data
  });

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url!, true);

    if (pathname === '/api/conversation') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // WebSocket connection handler
  wss.on('connection', async (ws: WebSocket, request) => {
    console.log('🔗 Client connected for personalized conversation');
    
    let geminiWs: WebSocket | null = null;
    let isGeminiConnected = false;
    let userTopics: string[] = [];
    let userName: string = 'there';
    let userId: string | null = null;
    let isProcessing = false;

    // Connect to Gemini Live API
    const connectToGemini = async () => {
      try {
        const geminiUrl = `${GEMINI_LIVE_API_URL}?key=${GEMINI_API_KEY}`;
        geminiWs = new WebSocket(geminiUrl);

        geminiWs.onopen = () => {
          console.log('🤖 Connected to Gemini Live API');
          isGeminiConnected = true;

          // Create dynamic system instruction with user's topics and name
          const topicsText = userTopics.length > 0 
            ? `\n\nCONVERSATION TOPICS: Only discuss these topics: ${userTopics.join(', ')}. If they try to discuss other topics, gently redirect: "That's interesting, ${userName}! But let's talk about [approved topic] - tell me about that!"`
            : '\n\nYou can discuss general conversation topics appropriate for English learners.';

          // Send initial setup message with user-specific context
          const setupMessage = {
            setup: {
              model: 'models/gemini-2.0-flash-exp',
              generation_config: {
                response_modalities: ['AUDIO'],
                speech_config: {
                  voice_config: {
                    prebuilt_voice_config: {
                      voice_name: 'Puck'
                    }
                  }
                }
              },
              system_instruction: {
                parts: [{
                  text: SYSTEM_INSTRUCTION + topicsText
                }]
              }
            }
          };

          geminiWs?.send(JSON.stringify(setupMessage));
          
          // Send personalized greeting request
          setTimeout(() => {
            const topicMention = userTopics.length > 0 
              ? ` I'm ready to practice English conversation with you about ${userTopics.slice(0, 2).join(' and ')}${userTopics.length > 2 ? ' and other topics' : ''}.`
              : ' I\'m ready to practice English conversation with you.';
              
            const greetingMessage = {
              client_content: {
                turns: [{
                  role: 'user',
                  parts: [{
                    text: `Hello! Please introduce yourself as L.I.A. to ${userName}.${topicMention} Ask how they are doing today in a very friendly, casual way. Use their name in your response and sound genuinely happy to talk with them.`
                  }]
                }],
                turn_complete: true
              }
            };
            geminiWs?.send(JSON.stringify(greetingMessage));
          }, 1000);
        };

        geminiWs.onmessage = (event) => {
          try {
            const messageData = typeof event.data === 'string' ? event.data : event.data.toString();
            const data = JSON.parse(messageData);
            
            if (data.serverContent?.modelTurn?.parts) {
              const parts = data.serverContent.modelTurn.parts;
              
              for (const part of parts) {
                if (part.inlineData?.mimeType === 'audio/pcm') {
                  // Forward audio response to client
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'audio_response',
                      audioData: part.inlineData.data,
                      mimeType: 'audio/pcm'
                    }));
                  }
                }
                
                if (part.text) {
                  // Also send text for debugging/display
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'text_response',
                      text: part.text
                    }));
                  }
                }
              }
            }

            if (data.serverContent?.turnComplete) {
              console.log(`✅ L.I.A. finished speaking to ${userName}`);
              isProcessing = false;
            }

          } catch (error) {
            console.error('❌ Error parsing Gemini response:', error);
            isProcessing = false;
          }
        };

        geminiWs.onclose = (event) => {
          console.log('🔌 Gemini WebSocket closed:', event.code, event.reason);
          isGeminiConnected = false;
          
          // Notify client
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Connection to AI service lost. Please refresh to reconnect.'
            }));
          }
        };

        geminiWs.onerror = (error) => {
          console.error('❌ Gemini WebSocket error:', error);
          isGeminiConnected = false;
        };

      } catch (error) {
        console.error('❌ Failed to connect to Gemini:', error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to connect to AI service. Please try again.'
          }));
        }
      }
    };

    // Handle messages from client
    ws.on('message', async (data: Buffer) => {
      try {
        // Check if it's JSON or binary audio data
        if (data[0] === 0x7B) { // Starts with '{' - JSON message
          const message = JSON.parse(data.toString());
          
          if (message.type === 'user_setup' && message.userId) {
            const userIdFromMessage = message.userId as string;
            userId = userIdFromMessage;
            console.log(`👤 Setting up personalized conversation for user: ${userId}`);
            
            // Fetch user's name and enabled topics
            const userData = await getUserData(userIdFromMessage);
            userName = userData.name;
            userTopics = userData.topics;
            
            console.log(`📚 Loaded ${userTopics.length} topics for ${userName}:`, userTopics);
            
            // Now connect to Gemini with user-specific context
            await connectToGemini();
            return;
          }
          
          if (message.type === 'audio_chunk' && isGeminiConnected) {
            if (isProcessing) {
              console.log('⏳ Still processing previous message, skipping...');
              return;
            }
            
            isProcessing = true;
            
            // Forward audio directly to Gemini
            const geminiMessage = {
              client_content: {
                turns: [{
                  role: 'user',
                  parts: [{
                    inline_data: {
                      mime_type: 'audio/pcm',
                      data: message.audioData
                    }
                  }]
                }],
                turn_complete: message.turnComplete || false
              }
            };

            geminiWs?.send(JSON.stringify(geminiMessage));
            console.log(`🎤 Forwarded ${userName}'s audio to Gemini`);
          }

          if (message.type === 'turn_complete' && isGeminiConnected) {
            // Signal end of user turn
            const turnCompleteMessage = {
              client_content: {
                turns: [],
                turn_complete: true
              }
            };

            geminiWs?.send(JSON.stringify(turnCompleteMessage));
            console.log(`✅ ${userName} finished speaking - signaled to Gemini`);
          }

        } else {
          // Handle raw binary audio data
          if (isGeminiConnected && !isProcessing) {
            isProcessing = true;
            
            const geminiMessage = {
              client_content: {
                turns: [{
                  role: 'user',
                  parts: [{
                    inline_data: {
                      mime_type: 'audio/pcm',
                      data: data.toString('base64')
                    }
                  }]
                }],
                turn_complete: true
              }
            };

            geminiWs?.send(JSON.stringify(geminiMessage));
            console.log(`🎤 Sent ${userName}'s raw audio to Gemini`);
          }
        }

      } catch (error) {
        console.error('❌ Error processing client message:', error);
        isProcessing = false;
      }
    });

    // Handle client disconnect
    ws.on('close', (code, reason) => {
      console.log(`🔌 ${userName || 'Client'} disconnected: ${code} - ${reason}`);
      
      // Close Gemini connection
      if (geminiWs) {
        geminiWs.close();
      }
    });

    // Handle client errors
    ws.on('error', (error) => {
      console.error(`❌ ${userName || 'Client'} WebSocket error:`, error);
    });
  });

  // Graceful shutdown
  const gracefulShutdown = () => {
    console.log('🛑 Shutting down L.I.A. server...');
    
    wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });
    
    server.close(() => {
      console.log('✅ Server closed gracefully');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  // Start server
  server.listen(port, hostname, () => {
    console.log(`🚀 L.I.A. Personalized Tutor ready on http://${hostname}:${port}`);
    console.log(`🎤 Features: Native audio, personalized topics, encouraging conversations`);
    console.log(`🇧🇷 Optimized for Brazilian Portuguese speakers learning English`);
    console.log(`📡 WebSocket endpoint: ws://${hostname}:${port}/api/conversation`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });

}).catch((error) => {
  console.error('❌ Failed to prepare Next.js app:', error);
  process.exit(1);
});