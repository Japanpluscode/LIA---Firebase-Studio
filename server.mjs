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

console.log('🚀 Starting LIA Server...');

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
    let userName = 'Student';

    clientWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Type:', message.type);

        if (message.type === 'setup') {
          userName = message.userName || 'Student';

          const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
          
          geminiWs = new WebSocket(geminiUrl);

          geminiWs.on('open', () => {
            console.log('🤖 Gemini connected');
            
            const setup = {
              setup: {
                model: "models/gemini-2.0-flash-exp",
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: {
                        voiceName: "Aoede"
                      }
                    }
                  }
                },
                systemInstruction: {
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
              
              if (msg.setupComplete) {
                console.log('✅ Gemini ready');
                isGeminiReady = true;
                clientWs.send(JSON.stringify({ type: 'ready' }));
                
                // AUTO-GREETING
                setTimeout(() => {
                  const greetingMessage = {
                    clientContent: {
                      turns: [{
                        role: 'user',
                        parts: [{ 
                          text: `Hello! My name is ${userName}. Please greet me warmly and ask how I'm doing today.` 
                        }]
                      }],
                      turnComplete: true
                    }
                  };
                  geminiWs.send(JSON.stringify(greetingMessage));
                  console.log('👋 Sent greeting');
                }, 1000);
              }

              if (msg.serverContent) {
                const parts = msg.serverContent.modelTurn?.parts || [];
                
                for (const part of parts) {
                  if (part.inlineData?.mimeType?.startsWith('audio/')) {
                    console.log('🔊 Audio chunk received');
                    clientWs.send(JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data
                    }));
                  }
                  
                  if (part.text) {
                    console.log('💬 Text:', part.text.substring(0, 100));
                    clientWs.send(JSON.stringify({
                      type: 'feedback',
                      feedback: part.text
                    }));
                  }
                }

                if (msg.serverContent.turnComplete) {
                  console.log('✅ Turn complete');
                  clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                }

                if (msg.serverContent.interrupted) {
                  console.log('⚠️ Gemini interrupted');
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

        else if (message.type === 'audio' && geminiWs && isGeminiReady) {
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: message.data,
                  mimeType: "audio/pcm;rate=16000"
                }]
              }
            }));
          }
        }

        else if (message.type === 'user_interrupted' && geminiWs && isGeminiReady) {
          console.log('🤚 User interrupted');
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              clientContent: {
                turnComplete: true
              }
            }));
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }
        }

        else if (message.type === 'turn_complete' && geminiWs && isGeminiReady) {
          console.log('📨 Turn complete from client');
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              clientContent: {
                turnComplete: true
              }
            }));
          }
        }

        else if (message.type === 'request_feedback' && geminiWs && isGeminiReady) {
          console.log('📝 Requesting feedback');
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [{
                    text: "Please give me honest, friendly feedback about our conversation. What did I do well? What should I work on? Keep it brief and encouraging."
                  }]
                }],
                turnComplete: true
              }
            }));
          }
        }

      } catch (err) {
        console.error('❌ Error:', err.message);
      }
    });

    clientWs.on('close', () => {
      console.log('🔌 Client disconnected');
      if (geminiWs) geminiWs.close();
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