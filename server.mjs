
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import next from 'next';
import minimist from 'minimist';

const args = minimist(process.argv.slice(2));

const dev = process.env.NODE_ENV !== 'production';
const hostname = args.hostname || process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(args.port || process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set.");
}
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:streamGenerateContent?key=${GEMINI_API_KEY}&alt=proto`;

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
        geminiWs = new (await import('ws')).WebSocket(GEMINI_WS_URL, {
            headers: {
              'Content-Type': 'application/json',
            },
        });

        geminiWs.on('open', () => {
          console.log('Connected to Gemini');

          const setupMsg = {
            model: 'gemini-1.5-flash-latest',
            generationConfig: {
              responseMimeType: 'audio/pcm',
              audioEncoding: 'LINEAR16',
            },
            systemInstruction: {
                parts: [{ text: message.systemInstruction || 'You are a helpful English teacher.' }]
            },
            contents: [],
          };
          geminiWs.send(JSON.stringify(setupMsg));
          clientWs.send(JSON.stringify({ type: 'ready' }));
        });

        geminiWs.on('message', (geminiData) => {
          try {
            const response = JSON.parse(geminiData);
            if (response.candidates && response.candidates.length > 0) {
              const candidate = response.candidates[0];
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  if (part.audio) {
                     clientWs.send(JSON.stringify({
                        type: 'audio',
                        data: part.audio
                     }));
                  }
                }
              }
              if(candidate.finishReason === 'TURN_COMPLETE') {
                  clientWs.send(JSON.stringify({ type: 'turn_complete' }));
              }
            }
          } catch(e) {
            console.error('Error parsing Gemini response', e);
          }
        });

        geminiWs.on('error', (err) => {
          console.error('Gemini error:', err);
          clientWs.send(JSON.stringify({ type: 'error', message: err.message }));
        });

        geminiWs.on('close', (code, reason) => {
            console.log('Gemini WebSocket closed', code, reason.toString());
        });

      }

      if (message.type === 'audio' && geminiWs) {
         geminiWs.send(JSON.stringify({
            contents: [{
                parts: [{
                    inlineData: {
                        mimeType: 'audio/pcm;rate=16000',
                        data: message.data
                    }
                }]
            }]
        }));
      }

      if (message.type === 'turn_complete' && geminiWs) {
        geminiWs.send(JSON.stringify({
          contents: [{
            parts: [{ text: 'user turn ended'}]
          }]
        }));
      }
    });

    clientWs.on('close', () => {
        console.log('Client disconnected');
      if (geminiWs) geminiWs.close();
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
