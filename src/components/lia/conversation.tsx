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
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);
  
  for (let i = 0; i < l; i++) {
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
  const [isSpeaking, setIsSpeaking] = useState(false);
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
  const inputNodeRef = useRef<GainNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const silenceStartRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const isInitializingRef = useRef(false);
  const hasInitializedRef = useRef(false);

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

  const initAudio = useCallback(() => {
    if (inputAudioContextRef.current && outputAudioContextRef.current) {
      console.log('🔊 Audio contexts already initialized');
      return;
    }

    console.log('🔊 Initializing audio contexts...');
    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
    
    inputNodeRef.current = inputAudioContextRef.current.createGain();
    outputNodeRef.current = outputAudioContextRef.current.createGain();
    outputNodeRef.current.connect(outputAudioContextRef.current.destination);
  }, []);

  const requestFeedback = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      stopRecording();
      setStatus('Preparing feedback...');
      toast({ title: 'Feedback Time!', description: 'Getting feedback...' });
      
      wsRef.current.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ text: 'Please give me simple, friendly feedback in 2-3 sentences about my English practice today.' }]
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
      
      await startRecording();

      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('👋 Sending greeting request');
          wsRef.current.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: `Hi! I'm ${userName}. Please greet me warmly in a friendly way and ask me one simple question to start our conversation.` }]
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
          console.log('🔊 Audio chunk received');
          const audioCtx = outputAudioContextRef.current;
          if (!audioCtx) continue;

          try {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);

            const audioBuffer = await decodeAudioData(decode(part.inlineData.data), audioCtx, 24000, 1);
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputNodeRef.current!);
            
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) {
                console.log('🎵 Audio playback complete');
                setIsSpeaking(false);
                setStatus('Listening...');
              }
            });

            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
            sourcesRef.current.add(source);
            setIsSpeaking(true);
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
        console.log('⚠️ AI interrupted');
        for (const source of sourcesRef.current.values()) {
          source.stop();
          sourcesRef.current.delete(source);
        }
        nextStartTimeRef.current = 0;
        setIsSpeaking(false);
        setStatus('Listening...');
      }
    }
  }, [userId, userName, userTopics, timeRemaining, isFeedbackTime, toast]);

  const initConnection = useCallback(async () => {
    if (isInitializingRef.current || hasInitializedRef.current) {
      console.log('⚠️ Already initializing or initialized');
      return;
    }

    isInitializingRef.current = true;

    try {
      console.log('🚀 Initializing connection...');
      
      initAudio();

      const response = await fetch('/api/gemini-key');
      if (!response.ok) {
        throw new Error('Failed to get API key');
      }
      const { apiKey } = await response.json();
      console.log('🔑 API key received');

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('🔌 WebSocket connected');
        hasInitializedRef.current = true;
        
        const topicList = userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'general conversation';
        
        const systemInstruction = `You are LIA, a warm and friendly English conversation partner helping ${userName} practice speaking English naturally.

STUDENT INFO:
Name: ${userName}
Profile: ${userProfile || 'Getting to know them'}
Topics for today: ${topicList}

YOUR PERSONALITY:
- Talk like a friend, not a teacher
- Keep it simple and natural
- Be patient and encouraging
- Show genuine interest in what they say

HOW TO TALK:
1. Keep responses VERY SHORT - just 1-2 sentences maximum
2. Ask ONE simple question at a time
3. If student speaks Portuguese, understand it but respond in simple English
4. Don't use complicated words or grammar terms
5. WAIT for the student to finish speaking before responding

EXAMPLES OF GOOD RESPONSES:

Student: "I like pizza"
You: "Me too! What's your favorite topping?"

Student: "Yesterday I go beach"
You: "Nice! The beach sounds fun. Did you swim?"

Student: "Eu gosto de viajar" (Portuguese)
You: "Oh, you like to travel! Where do you want to go?"

IMPORTANT RULES:
- MAXIMUM 1-2 sentences per response
- ONE simple question only
- Use easy, everyday words
- Be encouraging and positive
- If they make mistakes, just say it correctly in your response naturally
- Stay on today's topics: ${topicList}
- ALWAYS wait for the student to completely finish speaking

Remember: You're a FRIEND helping them practice, not a teacher testing them. Keep it fun, simple, and natural!`;

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

        console.log('📤 Sending setup');
        wsRef.current?.send(JSON.stringify(setupMessage));
      };

      wsRef.current.onmessage = async (event) => {
        try {
          let messageData: string;
          
          if (event.data instanceof Blob) {
            messageData = await event.data.text();
          } else if (typeof event.data === 'string') {
            messageData = event.data;
          } else {
            console.warn('Unknown message type:', typeof event.data);
            return;
          }

          try {
            const message = JSON.parse(messageData);
            await handleWebSocketMessage(message);
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
          }
        } catch (error) {
          console.error('Message handler error:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setStatus('Connection error');
        toast({ title: 'Connection Error', variant: 'destructive' });
        isInitializingRef.current = false;
      };

      wsRef.current.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        setStatus('Session ended');
        setConversationStarted(false);
        hasInitializedRef.current = false;
        isInitializingRef.current = false;
      };

    } catch (error) {
      console.error('❌ Init error:', error);
      toast({ title: 'Setup Error', description: String(error), variant: 'destructive' });
      isInitializingRef.current = false;
    }
  }, [userId, userName, userProfile, userTopics, toast, handleWebSocketMessage, initAudio]);

  const startRecording = useCallback(async () => {
    if (isRecording) {
      console.log('⚠️ Already recording');
      return;
    }

    try {
      console.log('🎤 Starting recording...');
      setStatus('Requesting microphone...');
      
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
      sourceNodeRef.current.connect(inputNodeRef.current!);
      
      const bufferSize = 256;
      scriptProcessorRef.current = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      const SILENCE_THRESHOLD = 0.01;
      const SILENCE_DURATION = 1500;

      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        if (!isRecording || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i] * pcmData[i];
        }
        const rms = Math.sqrt(sum / pcmData.length);
        
        // Debug logging (1% of the time)
        if (Math.random() < 0.01) {
          console.log('🎚️ Audio level:', rms.toFixed(4));
        }
        
        if (rms > SILENCE_THRESHOLD) {
          if (!isSpeakingRef.current) {
            console.log('🎤 User started speaking (RMS:', rms.toFixed(4), ')');
            isSpeakingRef.current = true;
            setStatus('Listening to you...');
          }
          silenceStartRef.current = Date.now();
          
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [createBlob(pcmData)]
            }
          }));
        } else if (isSpeakingRef.current) {
          const silenceDuration = Date.now() - silenceStartRef.current;
          
          if (Math.random() < 0.1) {
            console.log('🤫 Silence duration:', silenceDuration, 'ms');
          }
          
          if (silenceDuration > SILENCE_DURATION) {
            console.log('🤐 User stopped speaking - sending turn complete');
            isSpeakingRef.current = false;
            setStatus('Processing...');
            
            wsRef.current.send(JSON.stringify({
              clientContent: {
                turnComplete: true
              }
            }));
          }
        }
      };

      sourceNodeRef.current.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioCtx.destination);

      setIsRecording(true);
      setStatus('Listening...');
      console.log('✅ Recording started');
    } catch (error) {
      console.error('❌ Recording error:', error);
      setStatus('Microphone error');
      toast({ 
        title: 'Microphone Error', 
        description: 'Please allow microphone access and try again', 
        variant: 'destructive' 
      });
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
    if (conversationStarted || isInitializingRef.current) {
      console.log('⚠️ Conversation already in progress or initializing');
      return;
    }
    
    console.log('👆 Avatar clicked - starting conversation');
    setStatus('Connecting...');
    await initConnection();
  };

  // Cleanup ONLY on real unmount, not re-renders
  useEffect(() => {
    return () => {
      console.log('🧹 Component UNMOUNTING (not re-rendering)');
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      
      // Don't cleanup if conversation is active
      if (!conversationStarted) return;
      
      stopRecording();
      wsRef.current?.close();
      inputAudioContextRef.current?.close();
      outputAudioContextRef.current?.close();
    };
  }, []); // Empty dependency array = only on unmount

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
        className={cn(
          'relative rounded-full overflow-hidden w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 shadow-2xl',
          { 
            'cursor-pointer hover:scale-105': !conversationStarted, 
            'ring-4 ring-green-400 scale-105': isRecording && !isSpeaking,
            'ring-4 ring-blue-400 animate-pulse': isSpeaking,
            'ring-4 ring-yellow-400': isFeedbackTime 
          }
        )}>
        <LiaAvatar />
        {isRecording && !isSpeaking && (
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
          {conversationStarted 
            ? `Topics: ${userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'General Conversation'}` 
            : 'Click the avatar to start your conversation'}
        </p>
      </div>
    </div>
  );
}