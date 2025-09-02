'use client';

import {useState, useRef, useEffect, useCallback} from 'react';
import {Mic, Waves} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useToast} from '@/hooks/use-toast';

// Audio streaming parameters
const AI_VOICE_NAME = 'en-US-Studio-O'; // Should match the voice in server.ts
const MIC_SAMPLE_RATE = 16000; // Sample rate for the microphone
const STREAMING_LATENCY = 500; // The lower, the more real-time, but riskier for slow networks.

const LiaAvatar = () => (
  <svg
    className="absolute inset-0 w-full h-full text-primary" // inherits theme color
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="L.I.A. Avatar"
  >
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="70%" stopColor="currentColor" stopOpacity="0.75" />
        <stop offset="95%" stopColor="currentColor" stopOpacity="0" />
      </radialGradient>
      <clipPath id="circleClip">
        <circle cx="50" cy="50" r="40" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#glow)" className="opacity-50" />
    <image
      href="https://firebasestorage.googleapis.com/v0/b/lia-language-app.appspot.com/o/LIA.png?alt=media&token=87a71871-26b2-4b36-812b-109436413280"
      x="10"
      y="10"
      height="80"
      width="80"
      clipPath="url(#circleClip)"
      preserveAspectRatio="xMidYMid slice"
    />
    <circle
      cx="50"
      cy="50"
      r="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    />
  </svg>
);


export default function Conversation({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Now means "connecting"
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const {toast} = useToast();

  const playNextAudioChunk = useCallback(() => {
    if (audioQueueRef.current.length > 0 && audioContextRef.current) {
        const audioData = audioQueueRef.current.shift();
        if (!audioData) return;

        const ab = audioData.buffer.slice(
          audioData.byteOffset,
          audioData.byteOffset + audioData.byteLength
        );

        audioContextRef.current.decodeAudioData(ab)
            .then(buffer => {
                if (!audioContextRef.current) return;
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current.destination);
                source.onended = () => {
                    setIsAiSpeaking(false);
                    if (audioQueueRef.current.length > 0) {
                      playNextAudioChunk();
                    }
                };
                source.start();
                sourceNodeRef.current = source;
                setIsAiSpeaking(true);
            })
            .catch(e => console.error("Error decoding audio data", e));
    }
  }, []);

  const handleSocketMessage = useCallback(async (event: MessageEvent) => {
    let arrayBuf: ArrayBuffer;

    if (event.data instanceof ArrayBuffer) {
      arrayBuf = event.data;
    } else if (event.data instanceof Blob) {
      arrayBuf = await event.data.arrayBuffer();
    } else {
      console.warn('Unexpected WebSocket message type:', typeof event.data);
      return;
    }

    const audioChunk = new Uint8Array(arrayBuf);
    audioQueueRef.current.push(audioChunk);
    if (!isAiSpeaking) {
        playNextAudioChunk();
    }
  }, [isAiSpeaking, playNextAudioChunk]);

  const startListening = useCallback(async () => {
    if (isListening || isAiSpeaking) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: MIC_SAMPLE_RATE }});
      streamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0 && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
           wsRef.current.send(event.data);
        }
      };
      
      mediaRecorderRef.current.start(STREAMING_LATENCY);
      setIsListening(true);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description: 'Please enable microphone permissions in your browser settings.',
      });
      setIsListening(false);
    }
  }, [isListening, isAiSpeaking, toast]);

  const startConversation = useCallback(async () => {
    setIsProcessing(true);
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${proto}//${host}/api/conversation`;
    
    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer'; // Important: Ensure we get ArrayBuffers

    socket.onopen = () => {
      console.log('WebSocket connected');
      wsRef.current = socket;
      setConversationStarted(true);
      setIsProcessing(false);
      startListening();
    };

    socket.onmessage = handleSocketMessage;
    
    socket.onclose = () => {
      console.log('WebSocket disconnected');
      wsRef.current = null;
      setConversationStarted(false);
      setIsListening(false);
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: 'Could not connect to the conversation service.',
      });
      setIsProcessing(false);
      setConversationStarted(false);
    };

  }, [handleSocketMessage, toast, startListening]);


  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
     if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopListening();
    };
  }, [stopListening]);


  const buttonState = () => {
    if (isProcessing) return 'processing'; // Connecting
    if (!conversationStarted) return 'start';
    if (isAiSpeaking) return 'speaking';
    if (isListening) return 'listening';
    return 'idle';
  };

  const currentButtonState = buttonState();
  
  const handleButtonClick = () => {
    switch (currentButtonState) {
        case 'start':
            startConversation();
            break;
        case 'listening':
            stopListening();
            break;
        case 'idle':
            startListening();
            break;
        default:
            break; // Do nothing for 'processing' or 'speaking'
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div className="relative mb-8">
        <button
          onClick={handleButtonClick}
          disabled={currentButtonState === 'processing' || currentButtonState === 'speaking'}
          className={cn(
            'relative rounded-full w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 overflow-hidden',
            {
              'cursor-pointer hover:opacity-90': currentButtonState === 'start' || currentButtonState === 'listening' || currentButtonState === 'idle',
              'cursor-not-allowed opacity-80': currentButtonState === 'processing' || currentButtonState === 'speaking',
              'animate-pulse-strong': currentButtonState === 'speaking' || currentButtonState === 'processing' || currentButtonState === 'listening'
            }
          )}
          aria-label={
            currentButtonState === 'start' ? "Start Conversation" : 
            currentButtonState === 'listening' ? "Stop Listening" : "L.I.A. is active"
          }
        >
          <LiaAvatar />
        </button>
      </div>
      
       <div className="flex items-center justify-center h-16 text-center">
          {currentButtonState === 'listening' && (
            <div className="flex items-center space-x-2">
              <Mic className="h-6 w-6 text-red-400" />
              <p className="text-lg font-medium text-gray-300">Listening...</p>
            </div>
          )}
          {(currentButtonState === 'speaking' || currentButtonState === 'processing') && (
            <div className="flex items-center space-x-2">
              <Waves className="h-6 w-6 text-blue-400" />
              <p className="text-lg font-medium text-gray-300">{isProcessing ? 'Connecting...' : 'L.I.A. is speaking...'}</p>
            </div>
          )}
          {currentButtonState === 'start' && (
             <p className="text-lg font-medium text-gray-300">Click the avatar to start the conversation.</p>
          )}
          {currentButtonState === 'idle' && (
             <p className="text-lg font-medium text-gray-300">Click the avatar to speak.</p>
          )}
      </div>
    </div>
  );
}
