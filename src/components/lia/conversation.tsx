'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

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
  userName: string; // userName is passed from the page
  // userProfile and topics are fetched inside the component now
}

export default function Conversation({ userId, userName }: ConversationProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState('Click to start');
  const [userTopics, setUserTopics] = useState<any[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    // Fetch topics when the component mounts
    const fetchTopics = async () => {
      try {
        const topics = await getTopics(userId);
        setUserTopics(topics);
      } catch (error) {
        console.error("Failed to fetch topics", error);
        // Fallback to general conversation if topics fail to load
        setUserTopics([{ name: 'general conversation', enabled: true }]);
      }
    };
    fetchTopics();
  }, [userId]);


  const connectWebSocket = useCallback(() => {
    if (userTopics.length === 0) {
        toast({title: "Loading topics...", description: "Please wait a moment."});
        return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/live`;
    
    console.log('Connecting to:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      const topicList = userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'general English conversation';
      const systemInstruction = `You are L.I.A., a friendly English teacher. Keep responses brief (2-3 sentences). Only discuss: ${topicList}. Student: ${userName || 'Student'}`;
      
      ws.send(JSON.stringify({
        type: 'setup',
        systemInstruction
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'ready') {
        setStatus('Ready! Click to speak');
        toast({ title: 'Connected', description: 'L.I.A. is ready' });
      }
      
      if (message.type === 'audio') {
        playAudio(message.data);
      }
      
      if (message.type === 'turn_complete') {
        setIsSpeaking(false);
        setStatus('Your turn - click to speak');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('Connection error');
      toast({ title: 'Connection Error', variant: 'destructive'});
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
      setIsConnected(false);
      setStatus('Disconnected');
    };
  }, [userTopics, userName, toast]);

  const playAudio = useCallback(async (base64Data: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    setStatus('L.I.A. is speaking...');
    
    try {
      if (!audioContextRef.current) {
        // Gemini audio output is 24kHz
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // The server sends raw PCM, so we need to wrap it in a WAV header to be decodable
      const wavBuffer = createWavBuffer(bytes.buffer);
      const audioBuffer = await audioContextRef.current.decodeAudioData(wavBuffer);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
      
      source.onended = () => {
        setIsSpeaking(false);
        if (isConnected) {
             setStatus('Your turn - click to speak');
        }
      };
    } catch (error) {
      console.error('Audio playback error:', error);
      setIsSpeaking(false);
    }
  }, [isSpeaking, isConnected]);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      streamRef.current = stream;
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
       if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      streamSourceRef.current = source;
      
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isListening) {
          const inputData = e.inputBuffer.getChannelData(0);
          // The data is already linear PCM, we just need to convert to 16-bit
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            let s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
          
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64
          }));
        }
      };
      
      source.connect(processor);
      // We connect to the destination to provide mic feedback to the user, but mute it.
      processor.connect(audioContextRef.current.destination);
      if(audioContextRef.current.destination.gain) {
        audioContextRef.current.destination.gain.value = 0;
      }
      
      setIsListening(true);
      setStatus('Listening...');
      
      toast({ title: 'Listening', description: 'Speak now' });
    } catch (error) {
      console.error('Microphone error:', error);
      toast({ title: 'Error', description: 'Microphone access denied', variant: 'destructive' });
    }
  }, [toast, isListening]);

  const stopListening = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if(streamSourceRef.current) {
        streamSourceRef.current.disconnect();
        streamSourceRef.current = null;
    }
    if(scriptProcessorRef.current){
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'turn_complete' }));
    }
    
    setIsListening(false);
    setStatus('Processing...');
  }, []);

  const handleClick = () => {
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
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
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);
  
  // Helper function to create a WAV buffer from raw PCM data
  function createWavBuffer(pcmData: ArrayBuffer): ArrayBuffer {
      const sampleRate = 24000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const dataSize = pcmData.byteLength;
      const blockAlign = (numChannels * bitsPerSample) / 8;
      const byteRate = sampleRate * blockAlign;
      
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);

      // RIFF header
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(view, 8, 'WAVE');
      // fmt chunk
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); // PCM
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      // data chunk
      writeString(view, 36, 'data');
      view.setUint32(40, dataSize, true);

      // Write PCM data
      const pcmView = new Uint8Array(pcmData);
      const dataView = new Uint8Array(buffer, 44);
      dataView.set(pcmView);

      return buffer;
  }

  function writeString(view: DataView, offset: number, str: string) {
      for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
      }
  }


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

// These functions were moved from actions.ts to be self-contained in the component
// as they are only used here.
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

async function getTopics(userId: string) {
  try {
    const topicsCollection = collection(db, 'users', userId, 'topics');
    const topicsSnapshot = await getDocs(topicsCollection);
    const topics = topicsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as {id: string; name: string; enabled: boolean}[];
    return topics;
  } catch (error) {
    console.error('Error getting topics:', error);
    return [];
  }
}
