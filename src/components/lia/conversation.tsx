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

function createWavHeader(pcmData: Uint8Array, sampleRate: number, numChannels: number): ArrayBuffer {
  const dataSize = pcmData.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcmData);
  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export default function Conversation({ userId, userName }: ConversationProps) {
  const [isConnected, setIsConnected] = useState(false);
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
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();

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
            endConversation();
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

  const requestFeedback = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      stopRecording();
      wsRef.current.send(JSON.stringify({ type: 'request_feedback' }));
      setStatus('Preparing your feedback...');
      toast({ title: 'Feedback Time!', description: 'LIA is preparing your feedback...' });
    }
  }, [toast]);

  const endConversation = useCallback(() => {
    setConversationStarted(false);
    stopRecording();
    if (wsRef.current) wsRef.current.close();
    setStatus('Session complete!');
    toast({ title: 'Session Complete!', description: 'Your feedback has been saved.' });
  }, [toast]);

  const connectWebSocket = useCallback(() => {
    if (userTopics.length === 0) {
      toast({ title: "Loading topics...", description: "Please wait." });
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/conversation`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConversationStarted(true);
      setStatus('Connecting to LIA...');

      const topicList = userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'general English conversation';
      
      const systemInstruction = `You are LIA, a warm and friendly English conversation partner helping ${userName} practice speaking English naturally.

STUDENT INFO:
Name: ${userName}
Profile: ${userProfile || 'Getting to know them'}
Topics for today: ${topicList}

YOUR PERSONALITY:
- Talk like a friend, not a teacher
- Keep it simple and natural
- Be patient and encouraging
- Listen more, talk less

HOW TO TALK:
1. Keep responses SHORT - just 1-2 sentences
2. Ask ONE simple question at a time
3. If student speaks Portuguese, understand it but respond in simple English
4. Don't use complicated words or grammar terms
5. WAIT for the student to finish speaking before responding

EXAMPLES OF GOOD RESPONSES:

Student: "I like pizza"
You: "Me too! What's your favorite kind?"

Student: "Yesterday I go beach"
You: "Nice! The beach sounds fun. Did you swim?"

Student: "Eu gosto de viajar" (Portuguese)
You: "Oh, you like to travel! Where do you want to go?"

IMPORTANT RULES:
- ONLY 1-2 sentences per response
- ONE simple question
- Use easy words
- Be encouraging
- If they make mistakes, just say it correctly in your response
- Stay on today's topics: ${topicList}
- ALWAYS wait for the student to completely finish speaking

WHEN GIVING FEEDBACK (at the end):
Just say 2-3 things:
1. One thing they did well
2. One easy thing to practice
3. "Great job! Keep practicing!"

Remember: You're a FRIEND helping them practice, not a teacher testing them. Keep it fun, simple, and natural!`;

      ws.send(JSON.stringify({
        type: 'setup',
        systemInstruction,
        userId,
        userName,
        userProfile
      }));
      
      setTimeout(() => startRecording(), 1500);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'ready') {
        setStatus('Listening...');
        toast({ title: 'Ready!', description: 'LIA is ready!' });
      }
      if (message.type === 'audio') {
        playAudio(message.data);
      }
      if (message.type === 'feedback') {
        saveFeedbackToDatabase(message.feedback);
      }
      if (message.type === 'turn_complete') {
        setIsSpeaking(false);
        if (!isFeedbackTime) {
          setStatus('Your turn - speak now');
          startRecording();
        } else {
          setStatus('Feedback received!');
        }
      }
      if (message.type === 'interrupted') {
        stopAllAudioSources();
        setIsSpeaking(false);
        setStatus('Listening...');
      }
      if (message.type === 'error') {
        toast({ title: 'Error', description: message.message, variant: 'destructive' });
      }
    };

    ws.onerror = () => {
      setStatus('Connection error');
      toast({ title: 'Connection Error', variant: 'destructive' });
    };

    ws.onclose = () => {
      setIsConnected(false);
      setConversationStarted(false);
      if (!isFeedbackTime) setStatus('Click to start');
    };
  }, [userTopics, userName, userId, userProfile, toast, isFeedbackTime]);

  const saveFeedbackToDatabase = async (feedback: string) => {
    try {
      await saveConversationFeedback({
        userId,
        userName,
        feedback,
        topics: userTopics?.filter(t => t.enabled).map(t => t.name),
        duration: 10 * 60 - timeRemaining,
        date: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error saving feedback:', error);
    }
  };

  const stopAllAudioSources = useCallback(() => {
    for (const source of audioSourcesRef.current.values()) {
      try { source.stop(); } catch (e) {}
      audioSourcesRef.current.delete(source);
    }
    nextStartTimeRef.current = 0;
  }, []);

  const playAudio = useCallback(async (base64Data: string) => {
    setIsSpeaking(true);
    setStatus('LIA is speaking...');
    
    // Stop recording when AI starts speaking
    if (isRecording) {
      stopRecording();
    }

    try {
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
      }

      const decodedData = decode(base64Data);
      const wavBuffer = createWavHeader(decodedData, 24000, 1);
      const audioBuffer = await outputAudioContextRef.current.decodeAudioData(wavBuffer);

      const currentTime = outputAudioContextRef.current.currentTime;
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, currentTime);

      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioContextRef.current.destination);
      
      source.addEventListener('ended', () => {
        audioSourcesRef.current.delete(source);
        if (audioSourcesRef.current.size === 0) {
          setIsSpeaking(false);
          nextStartTimeRef.current = 0;
        }
      });

      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
      audioSourcesRef.current.add(source);

    } catch (error) {
      console.error('Audio error:', error);
      setIsSpeaking(false);
      setStatus('Error');
      nextStartTimeRef.current = 0;
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (isRecording || isFeedbackTime) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;

      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
      }

      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      streamSourceRef.current = source;

      const processor = inputAudioContextRef.current.createScriptProcessor(256, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isRecording) {
          const pcmData = e.inputBuffer.getChannelData(0);
          const audioBlob = createBlob(pcmData);
          wsRef.current.send(JSON.stringify({ type: 'audio', data: audioBlob.data }));
        }
      };

      source.connect(processor);
      processor.connect(inputAudioContextRef.current.destination);

      setIsRecording(true);
      setStatus('Listening - speak now...');

    } catch (error) {
      toast({ title: 'Microphone Error', description: 'Please allow microphone access', variant: 'destructive' });
      setStatus('Click to start');
    }
  }, [toast, isFeedbackTime, isRecording]);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

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
    
    setIsRecording(false);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'turn_complete' }));
      setStatus('Processing...');
    }
  }, [isRecording]);

  const handleClick = () => {
    if (isFeedbackTime && isSpeaking) return;
    
    if (inputAudioContextRef.current?.state === "suspended") inputAudioContextRef.current.resume();
    if (outputAudioContextRef.current?.state === "suspended") outputAudioContextRef.current.resume();
    
    if (!isConnected) {
      connectWebSocket();
    } else if (isRecording) {
      stopRecording();
    } else if (!isSpeaking && !isFeedbackTime) {
      startRecording();
    }
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      stopRecording();
      if (wsRef.current) wsRef.current.close();
      if (inputAudioContextRef.current) inputAudioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center w-full max-w-lg mx-auto">
      {conversationStarted && (
        <div className="mb-4 flex items-center gap-2 text-white/80">
          <Clock className="w-5 h-5" />
          <span className="text-lg font-mono">{formatTime(timeRemaining)}</span>
          {timeRemaining <= 120 && <span className="text-sm text-yellow-400 ml-2">Feedback time!</span>}
        </div>
      )}

      <div onClick={handleClick} className={cn('relative rounded-full overflow-hidden w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer', { 'ring-4 ring-green-400 scale-105': isRecording, 'ring-4 ring-blue-400 animate-pulse': isSpeaking, 'hover:scale-105': !isSpeaking && isConnected && !isFeedbackTime, 'ring-4 ring-yellow-400': isFeedbackTime })}>
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
          {isConnected ? `Today's Topics: ${userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'General Conversation'}` : 'Your AI Language Learning Assistant'}
        </p>
        {isRecording && <p className="text-xs text-green-400 mt-1">Click again when finished speaking</p>}
      </div>
    </div>
  );
}