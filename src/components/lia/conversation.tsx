'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Volume2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getTopics, getUser } from '@/app/admin/topics/actions';
import { saveConversationFeedback } from '@/app/actions/feedback';

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

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const int16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
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
  numChannels: number
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(numChannels, data.length / 2 / numChannels, sampleRate);
  const dataInt16 = new Int16Array(data.buffer);
  const dataFloat32 = new Float32Array(dataInt16.length);
  
  for (let i = 0; i < dataInt16.length; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }
  
  if (numChannels === 1) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter((_, index) => index % numChannels === i);
      buffer.copyToChannel(channel, i);
    }
  }
  
  return buffer;
}

export default function Conversation({ userId, userName }: ConversationProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Click to start');
  const [userTopics, setUserTopics] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<string>('');
  const [timeRemaining, setTimeRemaining] = useState(10 * 60);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isFeedbackTime, setIsFeedbackTime] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const topics = await getTopics(userId);
        setUserTopics(topics);
        const user = await getUser(userId);
        setUserProfile(user?.profile || '');
      } catch (error) {
        console.error("Failed to fetch data", error);
        setUserTopics([{ name: 'general conversation', enabled: true }]);
      }
    };
    fetchData();
  }, [userId]);

  useEffect(() => {
    if (conversationStarted && timeRemaining > 0 && !isFeedbackTime) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;
          if (newTime === 120 && !isFeedbackTime) {
            setIsFeedbackTime(true);
            requestFeedback();
          }
          if (newTime <= 0) {
            stopRecording();
            return 0;
          }
          return newTime;
        });
      }, 1000);
      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };
    }
  }, [conversationStarted, timeRemaining, isFeedbackTime]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const requestFeedback = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      stopRecording();
      setStatus('Preparing feedback...');
      toast({ title: 'Feedback Time!', description: 'Getting feedback...' });
      
      wsRef.current.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: 'Please give me simple, friendly feedback in 2-3 sentences.' }]
          }],
          turnComplete: true
        }
      }));
    }
  }, [toast]);

  const handleWebSocketMessage = useCallback(async (message: any) => {
    console.log('📨 Message received:', message);

    if (message.setupComplete) {
      console.log('✅ Setup complete');
      setConversationStarted(true);
      setStatus('Connected!');
      toast({ title: 'Ready!', description: 'LIA is listening!' });
      
      // Start recording first
      await startRecording();

      // Then send greeting after a delay
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('👋 Sending greeting');
          wsRef.current.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: `Hi! I'm ${userName}. Greet me warmly and ask one simple question.` }]
              }],
              turnComplete: true
            }
          }));
        }
      }, 1500);
    }

    if (message.serverContent) {
      const parts = message.serverContent.modelTurn?.parts || [];
      
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('audio/')) {
          console.log('🔊 Playing audio');
          const audioCtx = outputAudioContextRef.current;
          if (!audioCtx) continue;

          try {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);

            const audioBuffer = await decodeAudioData(decode(part.inlineData.data), audioCtx, 24000, 1);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) {
                console.log('🎵 Audio finished');
                setStatus('Listening...');
              }
            });

            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
            setStatus('LIA is speaking...');
          } catch (error) {
            console.error('Audio decode error:', error);
          }
        }

        if (part.text) {
          console.log('💬 Text received:', part.text);
          if (isFeedbackTime) {
            await saveConversationFeedback({
              userId,
              userName,
              feedback: part.text,
              topics: userTopics?.filter(t => t.enabled).map(t => t.name),
              duration: 10 * 60 - timeRemaining,
              date: new Date().toISOString()
            });
            setStatus('Feedback received!');
          }
        }
      }

      if (message.serverContent.interrupted) {
        console.log('⚠️ Interrupted');
        for (const source of sourcesRef.current.values()) {
          source.stop();
          sourcesRef.current.delete(source);
        }
        nextStartTimeRef.current = 0;
        setStatus('Listening...');
      }
    }
  }, [userId, userName, userTopics, timeRemaining, isFeedbackTime, toast]);

  const initConnection = useCallback(async () => {
    try {
      console.log('🚀 Initializing connection...');
      
      // Initialize audio contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextStartTimeRef.current = outputAudioContextRef.current.currentTime;

      // Get API key
      const response = await fetch('/api/gemini-key');
      if (!response.ok) {
        throw new Error('Failed to get API key');
      }
      const { apiKey } = await response.json();
      console.log('🔑 API key received');

      // Connect to Gemini WebSocket
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('🔌 WebSocket connected');
        const topicList = userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'general conversation';
        
        const systemInstruction = `You are LIA, a warm and friendly English conversation partner.

STUDENT: ${userName}
PROFILE: ${userProfile || 'Getting to know them'}
TOPICS: ${topicList}

RULES:
- Keep responses VERY SHORT (1-2 sentences max)
- Ask ONE simple question
- Use easy, simple words
- Be encouraging and friendly
- Stay on topics: ${topicList}

Remember: Be a FRIEND, not a teacher!`;

        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
              }
            },
            systemInstruction: { parts: [{ text: systemInstruction }] }
          }
        };

        console.log('📤 Sending setup:', setupMessage);
        wsRef.current?.send(JSON.stringify(setupMessage));
      };

      wsRef.current.onmessage = async (event) => {
        try {
          let messageData: string;
          
          // Handle different data types
          if (event.data instanceof Blob) {
            messageData = await event.data.text();
          } else if (typeof event.data === 'string') {
            messageData = event.data;
          } else {
            console.warn('Unknown message type:', typeof event.data);
            return;
          }

          // Parse JSON
          try {
            const message = JSON.parse(messageData);
            await handleWebSocketMessage(message);
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.log('Raw data:', messageData.substring(0, 200));
          }
        } catch (error) {
          console.error('Message handler error:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setStatus('Connection error');
        toast({ title: 'Connection Error', variant: 'destructive' });
      };

      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        setStatus('Session ended');
        setConversationStarted(false);
      };

    } catch (error) {
      console.error('❌ Init error:', error);
      toast({ title: 'Setup Error', description: String(error), variant: 'destructive' });
    }
  }, [userId, userName, userProfile, userTopics, toast, handleWebSocketMessage]);

  const startRecording = useCallback(async () => {
    if (isRecording) {
      console.log('⚠️ Already recording');
      return;
    }

    try {
      console.log('🎤 Starting recording...');
      await inputAudioContextRef.current?.resume();
      
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      const audioCtx = inputAudioContextRef.current;
      if (!audioCtx) {
        console.error('No audio context');
        return;
      }

      sourceNodeRef.current = audioCtx.createMediaStreamSource(mediaStreamRef.current);
      scriptProcessorRef.current = audioCtx.createScriptProcessor(256, 1, 1);

      scriptProcessorRef.current.onaudioprocess = (e) => {
        if (!isRecording || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const pcmData = e.inputBuffer.getChannelData(0);
        const blob = createBlob(pcmData);
        
        wsRef.current.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [blob]
          }
        }));
      };

      sourceNodeRef.current.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioCtx.destination);

      setIsRecording(true);
      setStatus('Listening...');
      console.log('✅ Recording started');
    } catch (error) {
      console.error('❌ Recording error:', error);
      toast({ title: 'Microphone Error', description: 'Please allow microphone access', variant: 'destructive' });
    }
  }, [isRecording, toast]);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    console.log('🛑 Stopping recording...');
    setIsRecording(false);

    if (scriptProcessorRef.current && sourceNodeRef.current) {
      scriptProcessorRef.current.disconnect();
      sourceNodeRef.current.disconnect();
    }

    scriptProcessorRef.current = null;
    sourceNodeRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setStatus('Recording stopped');
  }, [isRecording]);

  const handleClick = async () => {
    if (!conversationStarted) {
      console.log('👆 Avatar clicked - starting conversation');
      await initConnection();
    } else {
      console.log('⚠️ Conversation already started');
    }
  };

  useEffect(() => {
    return () => {
      console.log('🧹 Cleanup');
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      stopRecording();
      wsRef.current?.close();
      inputAudioContextRef.current?.close();
      outputAudioContextRef.current?.close();
    };
  }, [stopRecording]);

  return (
    <div className="flex flex-col items-center justify-center text-center w-full max-w-lg mx-auto">
      {conversationStarted && (
        <div className="mb-4 flex items-center gap-2 text-white/80">
          <Clock className="w-5 h-5" />
          <span className="text-lg font-mono">{formatTime(timeRemaining)}</span>
          {timeRemaining <= 120 && <span className="text-sm text-yellow-400 ml-2">Feedback time!</span>}
        </div>
      )}

      <div 
        onClick={handleClick} 
        className={cn('relative rounded-full overflow-hidden w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 shadow-2xl', { 
          'cursor-pointer hover:scale-105': !conversationStarted, 
          'ring-4 ring-green-400 scale-105': isRecording,
          'ring-4 ring-yellow-400': isFeedbackTime 
        })}>
        <LiaAvatar />
        {isRecording && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Mic className="w-12 h-12 text-white animate-pulse" />
          </div>
        )}
      </div>

      <div className="mt-8 text-center h-16">
        <p className="text-xl text-white font-medium">{status}</p>
        <p className="text-sm text-white/60 mt-2">
          {conversationStarted ? `Topics: ${userTopics?.filter(t => t.enabled).map(t => t.name).join(', ')}` : 'Click to start'}
        </p>
      </div>
    </div>
  );
}