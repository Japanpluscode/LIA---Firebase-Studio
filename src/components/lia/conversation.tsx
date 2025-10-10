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
  const [isListening, setIsListening] = useState(false);
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
  const isListeningRef = useRef(false);
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
      wsRef.current.send(JSON.stringify({ type: 'request_feedback' }));
      setStatus('Preparing your feedback...');
      toast({ title: 'Feedback Time!', description: 'LIA is preparing your feedback...' });
    }
  }, [toast]);

  const endConversation = useCallback(() => {
    setConversationStarted(false);
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
    isListeningRef.current = false;
    setIsListening(false);
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
      
      const systemInstruction = `You are LIA, a friendly English conversation partner helping ${userName} practice English naturally.

STUDENT PROFILE:
${userProfile || 'No profile provided yet'}

TODAY'S CONVERSATION TOPICS:
${topicList}

CRITICAL RULES:
1. SPEAK ONLY IN ENGLISH - Never Portuguese
2. USE THE STUDENT'S PROFILE to personalize the conversation
3. STAY FOCUSED on today's topics - don't go off-topic
4. Keep responses SHORT: 2-3 sentences (max 5 for complex topics)
5. ALWAYS end with a follow-up question related to the topic

PERSONALIZING WITH PROFILE:
- Reference their interests, hobbies, and goals from their profile
- Connect topics to their personal experiences
- Ask questions that relate to what they care about
- Example: If profile says "loves hiking" and topic is "Travel" → "Have you been on any great hikes recently? Where's your favorite trail?"

STAYING ON TOPIC:
- Every response must relate to one of today's topics: ${topicList}
- If student goes off-topic, gently redirect: "That's interesting! But let's talk about [topic from list]. Tell me about..."
- Use their profile to make the topic more engaging
- Example: Profile says "vegetarian" + Topic "Food" → "As a vegetarian, what's your favorite restaurant? What do you usually order?"

LANGUAGE HANDLING:
- Student is Brazilian - they may speak Portuguese
- You UNDERSTAND Portuguese but ALWAYS respond in ENGLISH
- Student: "Eu gosto de viajar" → You: "Oh, you love to travel! Based on your profile, I know you're interested in hiking. Have you combined travel with hiking before? Where?"

CONVERSATION PATTERN:
1. Listen to what student says
2. Respond in English (2-3 sentences)
3. Connect to their profile when possible
4. Ask a follow-up question about the topic
5. Keep it natural and friendly

EXAMPLES WITH PROFILE:

Student Profile: "Loves cooking, wants to visit Japan, studying for TOEFL"
Topic: Food

Student: "I like pasta"
You: "Pasta is delicious! Since you love cooking, do you make your own pasta from scratch? What's your signature dish?"

Student: "Eu fiz sushi ontem" (Portuguese)
You: "Wow, you made sushi yesterday! That's impressive, especially since you want to visit Japan. How did it turn out? What type did you make?"

GRAMMAR CORRECTION:
- Never say "that's wrong" or mention grammar rules
- Simply model the correct form naturally
- Student: "Yesterday I go restaurant" → You: "Nice! So you went to a restaurant yesterday. What did you order?"

RESPONSE LENGTH:
- Simple questions: 2-3 sentences
- Complex topics: 3-5 sentences max
- Never one-word answers
- Always include a follow-up question

STRICT TOPIC ENFORCEMENT:
Topics for today: ${topicList}
- If student talks about something NOT in this list, redirect immediately
- Example: Topics are "Food, Travel" but student talks about movies → "Movies are cool! But let's focus on food today. What's the best meal you've had while traveling?"

FEEDBACK TIME (when requested):
1. Highlight 2-3 specific things they did well
2. Mention 1-2 areas to practice (no grammar terms)
3. Reference their profile/goals if relevant
4. Keep to 4-5 sentences
5. Always in ENGLISH

Example feedback:
"Great job today! You spoke confidently about cooking, which clearly shows your passion. I noticed you used past tense really well when describing your sushi-making. One thing to practice is adding more descriptive words - instead of just 'good food,' try 'delicious' or 'flavorful.' Since you're studying for TOEFL, expanding your vocabulary will really help. Keep it up!"

Remember:
✅ Use student profile in EVERY conversation
✅ Stay on assigned topics STRICTLY
✅ 2-3 sentences per response
✅ Always ask follow-up questions
✅ English only, always
✅ Be encouraging and natural`;

      ws.send(JSON.stringify({
        type: 'setup',
        systemInstruction,
        userId,
        userName,
        userProfile
      }));
      
      setTimeout(() => startListening(), 1500);
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
        if (!isFeedbackTime) setStatus('Listening...');
        else setStatus('Feedback received!');
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

      const gainNode = outputAudioContextRef.current.createGain();
      gainNode.gain.value = 1.1;

      const currentTime = outputAudioContextRef.current.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNode);
      gainNode.connect(outputAudioContextRef.current.destination);
      
      source.addEventListener('ended', () => {
        audioSourcesRef.current.delete(source);
        if (audioSourcesRef.current.size === 0) {
          setIsSpeaking(false);
          nextStartTimeRef.current = 0;
          if (isConnected && !isFeedbackTime) setStatus('Listening...');
          else if (isFeedbackTime) setStatus('Feedback complete!');
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
  }, [isConnected, isFeedbackTime]);

  const startListening = useCallback(async () => {
    if (isFeedbackTime) return;
    if (isSpeaking) {
      stopAllAudioSources();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'user_interrupted' }));
      }
    }

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
        if (wsRef.current?.readyState === WebSocket.OPEN && isListeningRef.current) {
          const pcmData = e.inputBuffer.getChannelData(0);
          const audioBlob = createBlob(pcmData);
          wsRef.current.send(JSON.stringify({ type: 'audio', data: audioBlob.data }));
        }
      };

      const gainNode = inputAudioContextRef.current.createGain();
      gainNode.gain.value = 0;

      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(inputAudioContextRef.current.destination);

      isListeningRef.current = true;
      setIsListening(true);
      setStatus('Listening...');

    } catch (error) {
      toast({ title: 'Microphone Error', description: 'Please allow microphone access', variant: 'destructive' });
      setStatus('Click to start');
    }
  }, [toast, isFeedbackTime, isSpeaking, stopAllAudioSources]);

  const stopListening = useCallback(() => {
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
    }
    setIsListening(false);
    setStatus('Processing...');
  }, []);

  const handleClick = () => {
    if (isFeedbackTime && isSpeaking) return;
    if (inputAudioContextRef.current?.state === "suspended") inputAudioContextRef.current.resume();
    if (outputAudioContextRef.current?.state === "suspended") outputAudioContextRef.current.resume();
    
    if (!isConnected) connectWebSocket();
    else if (isListening) stopListening();
    else if (!isSpeaking && !isFeedbackTime) startListening();
    else if (isSpeaking) startListening();
  };

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
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

      <div onClick={handleClick} className={cn('relative rounded-full overflow-hidden w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer', { 'ring-4 ring-green-400 scale-105': isListening, 'ring-4 ring-blue-400 animate-pulse': isSpeaking, 'hover:scale-105': !isSpeaking && isConnected && !isFeedbackTime, 'ring-4 ring-yellow-400': isFeedbackTime })}>
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
          {isConnected ? `Today's Topics: ${userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'General Conversation'}` : 'Your AI Language Learning Assistant'}
        </p>
      </div>
    </div>
  );
}