'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getTopics } from '@/app/admin/topics/actions';

const LiaAvatar = () => (
  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="70%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.75 }} />
        <stop offset="95%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0 }} />
      </radialGradient>
      <clipPath id="circleClip"><circle cx="50" cy="50" r="40" /></clipPath>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#glow)" className="opacity-50" />
    <image href="https://firebasestorage.googleapis.com/v0/b/lia-language-app.firebasestorage.app/o/LIA.png?alt=media&token=c97d3cb6-1565-4205-bd13-80885907ff13" x="10" y="10" height="80" width="80" clipPath="url(#circleClip)" preserveAspectRatio="xMidYMid slice" />
    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" />
  </svg>
);

interface ConversationProps {
  userId: string;
  userName: string;
}

// Audio utility functions matching Google's implementation
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Convert float32 -1 to 1 to int16 -32768 to 32767
    int16[i] = data[i] * 32768;
  }

  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels,
    sampleRate,
  );

  const dataInt16 = new Int16Array(data.buffer);
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);
  for (let i = 0; i < l; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }
  
  // Extract interleaved channels
  if (numChannels === 1) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter(
        (_, index) => index % numChannels === i,
      );
      buffer.copyToChannel(channel, i);
    }
  }

  return buffer;
}

export default function Conversation({ userId, userName }: ConversationProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState('Click to start');
  const [userTopics, setUserTopics] = useState<any[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isListeningRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const { toast } = useToast();

  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const topics = await getTopics(userId);
        setUserTopics(topics);
      } catch (error) {
        console.error("Failed to fetch topics", error);
        setUserTopics([{ name: 'general conversation', enabled: true }]);
      }
    };
    fetchTopics();
  }, [userId]);

  const connectWebSocket = useCallback(() => {
    if (userTopics.length === 0) {
      toast({ title: "Loading topics...", description: "Please wait a moment." });
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/conversation`;

    console.log('🔗 Connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setIsConnected(true);
      setStatus('Connecting to L.I.A...');

      const topicList = userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'general English conversation';
      const systemInstruction = `You are L.I.A., a friendly English teacher. Keep responses brief (2-3 sentences). Only discuss: ${topicList}. Student: ${userName || 'Student'}`;

      ws.send(JSON.stringify({
        type: 'setup',
        systemInstruction
      }));
      console.log('📤 Sent setup message');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('📨 Received:', message.type);

      if (message.type === 'ready') {
        setStatus('Listening...');
        toast({ title: 'Ready!', description: 'Start speaking now' });
      }

      if (message.type === 'audio') {
        console.log('🔊 Playing audio response');
        playAudio(message.data);
      }

      if (message.type === 'turn_complete') {
        console.log('✅ Turn complete');
        setIsSpeaking(false);
        setStatus('Listening...');
      }

      if (message.type === 'interrupted') {
        console.log('⚠️ Interrupted - stopping all audio');
        stopAllAudioSources();
      }

      if (message.type === 'error') {
        console.error('❌ Server error:', message.message);
        toast({ title: 'Error', description: message.message, variant: 'destructive' });
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      setStatus('Connection error');
      toast({ title: 'Connection Error', variant: 'destructive' });
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket closed');
      setIsConnected(false);
      setStatus('Click to start');
    };
  }, [userTopics, userName, toast]);

  const stopAllAudioSources = useCallback(() => {
    for (const source of audioSourcesRef.current.values()) {
      try {
        source.stop();
      } catch (e) {
        // Already stopped
      }
      audioSourcesRef.current.delete(source);
    }
    nextStartTimeRef.current = 0;
  }, []);

  const playAudio = useCallback(async (base64Data: string) => {
    setIsSpeaking(true);
    setStatus('L.I.A. is speaking...');

    try {
      // Create separate output context for 24kHz
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
          sampleRate: 24000 
        });
        console.log('🎵 Output AudioContext created at 24kHz');
      }
      
      if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
      }

      // Decode using Google's method
      const decodedData = decode(base64Data);
      const audioBuffer = await decodeAudioData(
        decodedData,
        outputAudioContextRef.current,
        24000,
        1
      );

      // Schedule audio playback
      nextStartTimeRef.current = Math.max(
        nextStartTimeRef.current,
        outputAudioContextRef.current.currentTime
      );

      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioContextRef.current.destination);
      
      source.addEventListener('ended', () => {
        audioSourcesRef.current.delete(source);
        if (audioSourcesRef.current.size === 0) {
          console.log('🔇 All audio playback ended');
          setIsSpeaking(false);
          if (isConnected) {
            setStatus('Listening...');
          }
        }
      });

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
      audioSourcesRef.current.add(source);

    } catch (error) {
      console.error('❌ Audio playback error:', error);
      setIsSpeaking(false);
      setStatus('Error - Click to restart');
    }
  }, [isConnected]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
  
      streamRef.current = stream;
  
      // Create separate input context for 16kHz
      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
          sampleRate: 16000 
        });
        console.log('🎵 Input AudioContext created at 16kHz');
      }
      
      if (inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
      }
  
      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      streamSourceRef.current = source;
  
      // Use smaller buffer like Google's sample (256)
      const bufferSize = 256;
      const processor = inputAudioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = processor;
  
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isListeningRef.current) {
          const inputBuffer = e.inputBuffer;
          const pcmData = inputBuffer.getChannelData(0);
          
          // Use Google's createBlob function
          const audioBlob = createBlob(pcmData);
  
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: audioBlob.data
          }));
        }
      };
  
      // Create a muted gain node
      const gainNode = inputAudioContextRef.current.createGain();
      gainNode.gain.value = 0;
  
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(inputAudioContextRef.current.destination);
  
      isListeningRef.current = true;
      setIsListening(true);
      setStatus('Listening...');
  
      toast({ title: 'Listening', description: 'Speak now' });
      console.log('🎤 Started listening');
    } catch (error) {
      console.error('❌ Microphone error:', error);
      toast({ title: 'Microphone Error', description: 'Please allow microphone access', variant: 'destructive' });
      setStatus('Click to start');
    }
  }, [toast]);

  const stopListening = useCallback(() => {
    console.log('🛑 Stopping listening');
    
    isListeningRef.current = false;
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (streamSourceRef.current) {
      streamSourceRef.current.disconnect();
      streamSourceRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'turn_complete' }));
      console.log('✅ Sent turn_complete');
    }

    setIsListening(false);
    setStatus('Processing...');
  }, []);

  const handleClick = () => {
    if (inputAudioContextRef.current && inputAudioContextRef.current.state === "suspended") {
      inputAudioContextRef.current.resume();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state === "suspended") {
      outputAudioContextRef.current.resume();
    }
    if (!isConnected) {
      connectWebSocket();
    } else if (isListening) {
      stopListening();
    } else if (!isSpeaking) {
      startListening();
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (inputAudioContextRef.current) inputAudioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center w-full max-w-lg mx-auto">
      <div
        onClick={handleClick}
        className={cn(
          'relative rounded-full overflow-hidden w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer',
          {
            'ring-4 ring-green-400 scale-105': isListening,
            'ring-4 ring-blue-400 animate-pulse': isSpeaking,
            'hover:scale-105': !isSpeaking && isConnected,
            'opacity-75 cursor-not-allowed': isSpeaking
          }
        )}
      >
        <LiaAvatar />

        {isListening && !isSpeaking && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Mic className="w-12 h-12 text-white animate-pulse" />
          </div>
        )}

        {isSpeaking && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Volume2 className="w-12 h-12 text-white animate-pulse" />
          </div>
        )}
      </div>

      <div className="mt-8 text-center h-16">
        <p className="text-xl text-white font-medium">{status}</p>
        <p className="text-sm text-white/60 mt-2">
          {isConnected ? `Today's Topics: ${userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'General Conversation'}` : 'Real-time conversation with Gemini'}
        </p>
      </div>
    </div>
  );
}