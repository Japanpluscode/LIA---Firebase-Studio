
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-native-audio-preview-09-2025:streamGenerateContent?key=${GEMINI_API_KEY}`;

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

  wss.on('connection', (clientWs) => {
    console.log('Client connected');
    let geminiWs = null;

    clientWs.on('message', async (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'setup') {
        // Connect to Gemini
        geminiWs = new (await import('ws')).WebSocket(GEMINI_WS_URL);

        geminiWs.on('open', () => {
          console.log('Connected to Gemini');
          
          const setupMsg = {
            model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
            generationConfig: {
              responseMimeType: 'audio/pcm',
            },
            systemInstruction: {
              parts: [{ text: message.systemInstruction || 'You are a helpful English teacher.' }]
            }
          };

          geminiWs.send(JSON.stringify(setupMsg));
          clientWs.send(JSON.stringify({ type: 'ready' }));
        });

        geminiWs.on('message', (geminiData) => {
          const response = JSON.parse(geminiData);
          
          if (response.modelTurn?.parts) {
            for (const part of response.modelTurn.parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({
                  type: 'audio',
                  data: part.inlineData.data
                }));
              }
            }
          }

          if (response.turnComplete) {
            clientWs.send(JSON.stringify({ type: 'turn_complete' }));
          }
        });

        geminiWs.on('error', (err) => {
          console.error('Gemini error:', err);
          clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
        });

        clientWs.on('close', () => {
          if (geminiWs) geminiWs.close();
          console.log('Client disconnected');
        });
      }

      if (message.type === 'audio' && geminiWs) {
        geminiWs.send(JSON.stringify({
          mediaChunks: [{
            data: message.data,
            mimeType: 'audio/pcm;rate=16000'
          }]
        }));
      }

      if (message.type === 'turn_complete' && geminiWs) {
        geminiWs.send(JSON.stringify({
          turnComplete: true
        }));
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
