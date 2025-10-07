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

console.log('🚀 Starting L.I.A. Server...');

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error:', err);
      res.statusCode = 500;
      res.end('error');
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);
    if (pathname === '/api/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (clientWs) => {
    console.log('✅ Client connected');
    let geminiWs = null;
    let pingInterval = null;

    // Keep connection alive with ping/pong
    pingInterval = setInterval(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.ping();
      }
    }, 30000); // Ping every 30 seconds

    clientWs.on('pong', () => {
      console.log('📡 Client pong received');
    });

    clientWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Received message type:', message.type);

        if (message.type === 'setup') {
          const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
          geminiWs = new WebSocket(wsUrl);

          geminiWs.on('open', () => {
            console.log('🤖 Connected to Gemini Live');
            
            geminiWs.send(JSON.stringify({
              setup: {
                model: 'models/gemini-2.0-flash-exp',
                generation_config: {
                  response_modalities: ['AUDIO'],
                  speech_config: {
                    voice_config: {
                      prebuilt_voice_config: { voice_name: 'Kore' }
                    }
                  }
                },
                system_instruction: {
                  parts: [{ text: message.systemInstruction || 'You are L.I.A.' }]
                }
              }
            }));
            
            clientWs.send(JSON.stringify({ type: 'ready' }));
            console.log('✅ Sent ready to client');
          });

          geminiWs.on('message', (geminiData) => {
            try {
              const response = JSON.parse(geminiData);
              console.log('🎤 Received from Gemini:', Object.keys(response));
              
              if (response.serverContent?.modelTurn?.parts) {
                for (const part of response.serverContent.modelTurn.parts) {
                  if (part.inlineData?.data) {
                    console.log('🔊 Sending audio to client');
                    clientWs.send(JSON.stringify({
                      type: 'audio',
                      data: part.inlineData.data
                    }));
                  }
                }
              }

              if (response.serverContent?.turnComplete) {
                console.log('✅ Turn complete');
                clientWs.send(JSON.stringify({ type: 'turn_complete' }));
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          });

          geminiWs.on('error', (err) => {
            console.error('❌ Gemini error:', err);
            clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
          });

          geminiWs.on('close', () => {
            console.log('🔌 Gemini connection closed');
          });
        }

        if (message.type === 'audio' && geminiWs) {
          console.log('🎤 Forwarding audio to Gemini');
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              realtimeInput: {
                mediaChunks: [{ data: message.data, mimeType: 'audio/pcm;rate=16000' }]
              }
            }));
          } else {
            console.error('❌ Gemini WebSocket not open');
          }
        }

        if (message.type === 'turn_complete' && geminiWs) {
          console.log('✅ Turn complete from client');
          if (geminiWs.readyState === WebSocket.OPEN) {
            geminiWs.send(JSON.stringify({
              clientContent: { turnComplete: true }
            }));
          }
        }
      } catch (error) {
        console.error('❌ Error processing message:', error);
      }
    });

    clientWs.on('close', () => {
      console.log('🔌 Client disconnected');
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      if (geminiWs) {
        geminiWs.close();
      }
    });

    clientWs.on('error', (err) => {
      console.error('❌ Client WebSocket error:', err);
    });
  });

  server.listen(port, hostname, () => {
    console.log(`✅ Ready on http://${hostname}:${port}`);
  });
});