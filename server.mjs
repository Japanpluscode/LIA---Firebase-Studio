
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import next from 'next';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is not set.');
  process.exit(1);
}

// Note: The v1beta version of the Gemini API is used here for compatibility with some environments.
// For the latest features, you might switch to v1alpha, but v1beta is often more stable.
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;


app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling HTTP request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
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
      console.log(`Socket destroyed for path: ${pathname}`);
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs) => {
    console.log('Client WebSocket connected.');
    let googleStream;

    clientWs.on('message', async (data) => {
        const message = JSON.parse(data);

        if (message.type === 'setup') {
            try {
                const { VertexAI } = await import('@google-cloud/vertexai');
                const vertex_ai = new VertexAI({ project: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, location: 'us-central1' });
                const generativeModel = vertex_ai.getGenerativeModel({
                    model: 'gemini-1.5-flash-001',
                    systemInstruction: {
                      role: 'system',
                      parts: [{ text: message.systemInstruction }],
                    },
                });

                googleStream = await generativeModel.startChat({});
                clientWs.send(JSON.stringify({ type: 'ready' }));
                console.log('Gemini Chat session started and ready.');

            } catch (err) {
                console.error('Failed to initialize Vertex AI or start chat:', err);
                clientWs.send(JSON.stringify({ type: 'error', message: 'Failed to start AI session.' }));
            }
        } else if (message.type === 'audio' && googleStream) {
            try {
                const audioAsBase64 = message.data;
                const result = await googleStream.sendMessageStream([
                    { inlineData: { mimeType: 'audio/webm', data: audioAsBase64 } }
                ]);
                
                for await (const item of result.stream) {
                    if (item.candidates && item.candidates[0].content && item.candidates[0].content.parts) {
                        const textPart = item.candidates[0].content.parts.find(part => part.text);
                         if (textPart) {
                            // This implementation sends text back to the client.
                            // To send audio, a TTS step would be needed here.
                            // For now, we are building towards a full audio-in, audio-out solution.
                         }
                    }
                }
            } catch(e) {
                console.error("Error sending audio to Gemini:", e);
            }
        } else if (message.type === 'turn_complete') {
             // In a full implementation, this signals the end of the user's speech turn.
             // We would process the collected audio here. For now, it's a placeholder.
        }
    });

    clientWs.on('close', () => {
        console.log('Client WebSocket disconnected.');
        // No specific stream to end here in the new model, sessions are managed differently.
    });

    clientWs.on('error', (error) => {
        console.error('Client WebSocket error:', error);
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: Port ${port} is already in use. Please stop the other process or specify a different port.`);
      process.exit(1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
});
