
// src/server.ts
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { VertexAI } from '@google-cloud/vertexai';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
// Use the PORT environment variable provided by the system, or default to 3000
const port = parseInt(process.env.PORT || '3000', 10);
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Define the desired voice for the AI
// This name must be chosen from the official Google Cloud documentation.
// 'en-US-Studio-O' is a high-quality female voice used as a placeholder.
const AI_VOICE_NAME = "en-US-Studio-O";

// Initialize Vertex AI
const vertex_ai = new VertexAI({
  project: process.env.GCP_PROJECT_ID || '',
  location: process.env.GCP_LOCATION || '',
});

const model = 'gemini-2.5-flash-live';

const generativeModel = vertex_ai.getGenerativeModel({
  model: model,
});

const audioConfig = {
    synthesisConfig: {
      voice: {
        name: AI_VOICE_NAME,
      },
      speakingRate: 1.0,
      pitch: 0,
    },
};

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });
  
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url!, true);

    if (pathname === '/api/conversation') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: WebSocket) => {
    console.log('Client connected');

    let googleStream: any; // Bi-directional stream with Google
    
    try {
      const chat = generativeModel.startChat(audioConfig);
      googleStream = await chat.startStream();
      console.log('Established stream with Vertex AI.');
    } catch(err) {
      console.error('Error establishing stream with Vertex AI:', err);
      ws.close(1011, 'Failed to connect to AI service.');
      return;
    }


    // Handle messages from the client (audio chunks)
    ws.on('message', async (message: Buffer) => {
        // Forward the audio chunk to Google
        if (googleStream) {
            await googleStream.send({ audio: message });
        }
    });

    // Handle messages from Google (AI audio response)
    googleStream.response.then((stream: any) => {
        (async () => {
            for await (const response of stream) {
                if (response.candidates && response.candidates[0].content.parts[0].audio) {
                    const aiAudioChunk = response.candidates[0].content.parts[0].audio;
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(aiAudioChunk);
                    }
                }
            }
        })().catch(err => {
            console.error('Error reading from Google stream:', err);
            if(ws.readyState === WebSocket.OPEN) {
                ws.close(1011, 'Error from AI service.');
            }
        });
    });

    const closeConnections = () => {
        console.log('Closing connections.');
        if (googleStream) {
            // This method to end the stream might need adjustment based on SDK updates
            googleStream.end();
            googleStream = null;
        }
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    };
    
    ws.on('close', () => {
      console.log('Client disconnected.');
      closeConnections();
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      closeConnections();
    });

  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: Port ${port} is already in use. Please stop the other process or specify a different port.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
});
