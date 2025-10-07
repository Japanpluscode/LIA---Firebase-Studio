// server.mjs - Corrected for @google/genai v1.22.0
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
          // Use raw WebSocket but with corrected message format from Google's sample
          const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
          
          geminiWs = new WebSocket(geminiUrl);

          geminiWs.on('open', () => {
            console.log('🤖 Gemini connected');
            
            // Match Google's sample setup format exactly
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
                    text: message.systemInstruction || "You are L.I.A., a friendly language learning assistant. Keep responses brief and conversational."
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
              console.log('🎤 FROM GEMINI:', Object.keys(msg).join(', '));
              
              if (msg.setupComplete) {
                console.log('✅ Gemini ready');
                isGeminiReady = true;
                clientWs.send(JSON.stringify({ type: 'ready' }));
              }

              if (msg.serverContent) {
                const parts = msg.serverContent.modelTurn?.parts || [];
                console.log('📦 Parts:', parts.length);
                
                for (const part of parts) {
                  if (part.inlineData?.mimeType?.startsWith('audio/')) {
                    console.log('🔊 Audio! Size:', part.inlineData.data?.substring(0, 50).length);
                    clientWs.send(JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data,
                      mimeType: part.inlineData.mimeType
                    }));
                  }
                  
                  if (part.text) {
                    console.log('💬 Text:', part.text.substring(0, 100));
                  }
                }

                if (msg.serverContent.turnComplete) {
                  console.log('✅ Turn complete from Gemini');
                  clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                }

                if (msg.serverContent.interrupted) {
                  console.log('⚠️ Interrupted');
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
          });
        }

        // Send audio - match Google's format from utils.ts createBlob function
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
          }
        }

        else if (message.type === 'turn_complete' && geminiWs && isGeminiReady) {
          console.log('📨 Turn complete from client');
          if (geminiWs.readyState === WebSocket.OPEN) {
            // Send empty audio chunk
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: "",
                  mimeType: "audio/pcm;rate=16000"
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