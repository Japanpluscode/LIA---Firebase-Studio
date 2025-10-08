// server.mjs - Complete with interruption support
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY not set");
}

console.log('🚀 Starting LIA Live API Server...');

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '');
    
    if (pathname === '/api/conversation') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs) => {
    console.log('✅ Client connected');
    
    let geminiWs = null;
    let isGeminiReady = false;
    let currentUserId = null;
    let currentUserName = null;

    clientWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Type:', message.type);

        if (message.type === 'setup') {
          // Store user info
          currentUserId = message.userId;
          currentUserName = message.userName;

          // Connect to Gemini
          const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
          
          geminiWs = new WebSocket(geminiUrl);

          geminiWs.on('open', () => {
            console.log('🤖 Gemini connected');
            
            const setup = {
              setup: {
                model: "models/gemini-2.0-flash-exp",
                generation_config: {
                  response_modalities: ["AUDIO"],
                  speech_config: {
                    voice_config: {
                      prebuilt_voice_config: {
                        voice_name: "Aoede"
                      }
                    }
                  }
                },
                system_instruction: {
                  parts: [{
                    text: message.systemInstruction || "You are LIA, a friendly conversation partner."
                  }]
                }
              }
            };

            geminiWs.send(JSON.stringify(setup));
            console.log('📤 Setup sent to Gemini');
          });

          geminiWs.on('message', (geminiData) => {
            try {
              const msg = JSON.parse(geminiData.toString());
              console.log('🎤 FROM GEMINI:', Object.keys(msg).join(', '));
              
              if (msg.setupComplete) {
                console.log('✅ Gemini ready');
                isGeminiReady = true;
                clientWs.send(JSON.stringify({ type: 'ready' }));
              }

              if (msg.serverContent) {
                const parts = msg.serverContent.modelTurn?.parts || [];
                console.log('📦 Parts received:', parts.length);
                
                for (const part of parts) {
                  // Handle audio response
                  if (part.inlineData?.mimeType?.startsWith('audio/')) {
                    console.log('🔊 Audio chunk received');
                    clientWs.send(JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType
                    }));
                  }
                  
                  // Handle text (for feedback)
                  if (part.text) {
                    console.log('💬 Text received:', part.text.substring(0, 100));
                    clientWs.send(JSON.stringify({
                      type: 'feedback',
                      feedback: part.text
                    }));
                  }
                }

                if (msg.serverContent.turnComplete) {
                  console.log('✅ Turn complete from Gemini');
                  clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                }

                if (msg.serverContent.interrupted) {
                  console.log('⚠️ Gemini was interrupted');
                  clientWs.send(JSON.stringify({ type: 'interrupted' }));
                }
              }

            } catch (err) {
              console.error('❌ Parse error:', err.message);
            }
          });

          geminiWs.on('error', (err) => {
            console.error('❌ Gemini error:', err.message);
            clientWs.send(JSON.stringify({ 
              type: 'error', 
              message: err.message 
            }));
          });

          geminiWs.on('close', (code, reason) => {
            console.log(`🔌 Gemini closed: ${code} ${reason || ''}`);
            isGeminiReady = false;
          });
        }

        // Send audio
        else if (message.type === 'audio' && geminiWs && isGeminiReady) {
          if (geminiWs.readyState === WebSocket.OPEN) {
            const audioInput = {
              realtimeInput: {
                mediaChunks: [{
                  data: message.data,
                  mimeType: "audio/pcm;rate=16000"
                }]
              }
            };
            
            geminiWs.send(JSON.stringify(audioInput));
          } else {
            console.warn('⚠️ Gemini not ready');
          }
        }

        // User interrupted LIA
        else if (message.type === 'user_interrupted' && geminiWs && isGeminiReady) {
          console.log('🤚 User interrupted LIA - stopping current response');
          if (geminiWs.readyState === WebSocket.OPEN) {
            // Send turn complete to stop Gemini's current response
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: "",
                  mimeType: "audio/pcm;rate=16000"
                }]
              }
            }));
            
            // Notify client that interruption was processed
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
            console.log('✅ Interruption signal sent to Gemini');
          }
        }

        // Turn complete
        else if (message.type === 'turn_complete' && geminiWs && isGeminiReady) {
          console.log('📨 Turn complete from client');
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: "",
                  mimeType: "audio/pcm;rate=16000"
                }]
              }
            }));
            console.log('✅ Turn end sent to Gemini');
          }
        }

        // Request feedback
        else if (message.type === 'request_feedback' && geminiWs && isGeminiReady) {
          console.log('📝 Requesting feedback from Gemini');
          if (geminiWs.readyState === WebSocket.OPEN) {
            // First, send turn complete to end current audio stream
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: "",
                  mimeType: "audio/pcm;rate=16000"
                }]
              }
            }));

            // Wait a bit, then send feedback request
            setTimeout(() => {
              geminiWs.send(JSON.stringify({
                clientContent: {
                  turns: [{
                    parts: [{
                      text: "Our practice session is almost done. Please give me honest, friendly feedback about our conversation. What did I do well? What should I work on? Keep it brief, encouraging, and natural - like a friend helping me improve. No more than 3-4 sentences."
                    }],
                    role: "user"
                  }],
                  turnComplete: true
                }
              }));
              console.log('✅ Feedback request sent to Gemini');
            }, 500);
          }
        }

      } catch (err) {
        console.error('❌ Error processing message:', err.message);
      }
    });

    clientWs.on('close', () => {
      console.log('🔌 Client disconnected');
      if (geminiWs) {
        geminiWs.close();
      }
    });

    clientWs.on('error', (err) => {
      console.error('❌ Client error:', err.message);
    });
  });

  server.listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`✅ Ready on http://${hostname}:${port}`);
  });
});