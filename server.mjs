// server.mjs - Gemini Live API with correct audio specs
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

console.log('🚀 Starting L.I.A. Live API Server...');

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

    clientWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Type:', message.type);

        if (message.type === 'setup') {
          // Gemini Live API WebSocket endpoint
          const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
          
          geminiWs = new WebSocket(geminiUrl);

          geminiWs.on('open', () => {
            console.log('🤖 Gemini Live connected');
            
            // Setup message for Live API
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
                    text: message.systemInstruction || "You are L.I.A., a friendly language learning assistant."
                  }]
                }
              }
            };

            geminiWs.send(JSON.stringify(setup));
            console.log('📤 Setup sent');
          });

          geminiWs.on('message', (geminiData) => {
            try {
              const msg = JSON.parse(geminiData.toString());
              
              // Setup complete
              if (msg.setupComplete) {
                console.log('✅ Gemini ready');
                isGeminiReady = true;
                clientWs.send(JSON.stringify({ type: 'ready' }));
              }

              // Handle server content (responses)
              if (msg.serverContent) {
                const modelTurn = msg.serverContent.modelTurn;
                
                if (modelTurn?.parts) {
                  for (const part of modelTurn.parts) {
                    // Audio response (24kHz PCM from Gemini)
                    if (part.inlineData?.mimeType === 'audio/pcm') {
                      console.log('🔊 Audio response received');
                      clientWs.send(JSON.stringify({
                        type: 'audio',
                        data: part.inlineData.data,
                        mimeType: 'audio/pcm' // 24kHz from Gemini
                      }));
                    }
                    
                    // Text response (if any)
                    if (part.text) {
                      console.log('💬 Text:', part.text.substring(0, 100));
                    }
                  }
                }

                // Turn complete
                if (msg.serverContent.turnComplete) {
                  console.log('✅ Turn complete');
                  clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                }
              }

              // Handle tool calls if needed
              if (msg.toolCall) {
                console.log('🔧 Tool call:', msg.toolCall);
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
            console.log(`🔌 Gemini closed: ${code} ${reason || 'no reason'}`);
          });
        }

        // Forward audio to Gemini (16kHz PCM input)
        else if (message.type === 'audio' && geminiWs && isGeminiReady) {
          if (geminiWs.readyState === WebSocket.OPEN) {
            const audioInput = {
              realtimeInput: {
                mediaChunks: [{
                  data: message.data, // Base64 encoded PCM 16kHz
                  mimeType: "audio/pcm" // Live API expects just "audio/pcm"
                }]
              }
            };
            
            geminiWs.send(JSON.stringify(audioInput));
            console.log('🎤 Audio sent to Gemini');
          } else {
            console.warn('⚠️ Gemini not ready, state:', geminiWs.readyState);
          }
        }

        // End of user turn
        else if (message.type === 'turn_complete' && geminiWs && isGeminiReady) {
          if (geminiWs.readyState === WebSocket.OPEN) {
            // Send empty audio chunk to signal end
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: "",
                  mimeType: "audio/pcm"
                }]
              }
            }));
            console.log('✅ Turn end sent');
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