// server.mjs - Fixed Gemini message handling
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
          const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
          
          geminiWs = new WebSocket(geminiUrl);

          geminiWs.on('open', () => {
            console.log('🤖 Gemini Live connected');
            
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
              
              // Log ALL message types from Gemini
              console.log('🎤 FROM GEMINI:', JSON.stringify(msg, null, 2).substring(0, 500));
              
              if (msg.setupComplete) {
                console.log('✅ Gemini ready');
                isGeminiReady = true;
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'ready' }));
                }
              }

              if (msg.serverContent) {
                console.log('📦 Server content received');
                const modelTurn = msg.serverContent.modelTurn;
                
                if (modelTurn?.parts) {
                  console.log('🎵 Parts found:', modelTurn.parts.length);
                  
                  for (const part of modelTurn.parts) {
                    if (part.inlineData) {
                      console.log('🔊 Audio response! MIME:', part.inlineData.mimeType, 'Size:', part.inlineData.data?.length || 0);
                      
                      if (clientWs.readyState === WebSocket.OPEN) {
                        clientWs.send(JSON.stringify({
                          type: 'audio',
                          data: part.inlineData.data,
                          mimeType: part.inlineData.mimeType || 'audio/pcm'
                        }));
                        console.log('✅ Audio forwarded to client');
                      }
                    }
                    
                    if (part.text) {
                      console.log('💬 Text:', part.text);
                    }
                  }
                }

                if (msg.serverContent.turnComplete) {
                  console.log('✅ Turn complete from Gemini');
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                  }
                }
              }

            } catch (err) {
              console.error('❌ Parse error:', err.message);
              console.error('Raw data:', geminiData.toString().substring(0, 200));
            }
          });

          geminiWs.on('error', (err) => {
            console.error('❌ Gemini error:', err.message);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ 
                type: 'error', 
                message: err.message 
              }));
            }
          });

          geminiWs.on('close', (code, reason) => {
            console.log(`🔌 Gemini closed: ${code} ${reason || 'no reason'}`);
          });
        }

        else if (message.type === 'audio' && geminiWs && isGeminiReady) {
          if (geminiWs.readyState === WebSocket.OPEN) {
            const audioInput = {
              realtimeInput: {
                mediaChunks: [{
                  data: message.data,
                  mimeType: "audio/pcm"
                }]
              }
            };
            
            geminiWs.send(JSON.stringify(audioInput));
            // Reduced logging for audio chunks
          } else {
            console.warn('⚠️ Gemini not open:', geminiWs.readyState);
          }
        }

        else if (message.type === 'turn_complete' && geminiWs && isGeminiReady) {
          console.log('📨 Turn complete from client');
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{
                  data: "",
                  mimeType: "audio/pcm"
                }]
              }
            }));
            console.log('✅ Turn end sent to Gemini');
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