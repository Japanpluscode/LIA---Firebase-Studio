'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Volume2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getTopics } from '@/app/admin/topics/actions';
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

// Audio utility functions
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
  const [timeRemaining, setTimeRemaining] = useState(15 * 60); // 15 minutes
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
  const conversationTranscriptRef = useRef<string[]>([]);

  const { toast } = useToast();

  // Timer countdown
  useEffect(() => {
    if (conversationStarted && timeRemaining > 0 && !isFeedbackTime) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;
          
          // Trigger feedback at 1 minute remaining (14 minutes elapsed)
          if (newTime === 60 && !isFeedbackTime) {
            console.log('⏰ Time for feedback!');
            setIsFeedbackTime(true);
            requestFeedback();
          }
          
          // End conversation at 0
          if (newTime <= 0) {
            endConversation();
            return 0;
          }
          
          return newTime;
        });
      }, 1000);

      return () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      };
    }
  }, [conversationStarted, timeRemaining, isFeedbackTime]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  const requestFeedback = useCallback(() => {
    console.log('⏰ Requesting feedback from L.I.A.');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'request_feedback'
      }));
      setStatus('Preparing your feedback...');
      toast({ 
        title: 'Feedback Time!', 
        description: 'L.I.A. is preparing your feedback...' 
      });
    }
  }, [toast]);

  const endConversation = useCallback(() => {
    console.log('⏹️ Ending conversation');
    setConversationStarted(false);
    
    // Stop listening
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
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setStatus('Session complete! Great work!');
    toast({ 
      title: 'Session Complete!', 
      description: 'Your feedback has been saved.' 
    });
  }, [toast]);

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
      setConversationStarted(true);
      setStatus('Connecting to L.I.A...');

      const topicList = userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'general English conversation';
      
      const systemInstruction = `You are L.I.A., a friendly conversation partner helping ${userName || 'your friend'} practice English naturally.

IMPORTANT - NEVER MENTION GRAMMAR:
- NEVER say things like "that's wrong", "the correct grammar is", "you should use present perfect", etc.
- NEVER explain grammar rules or mention tenses, verb forms, or grammar terms
- You're NOT a teacher - you're a supportive friend having a natural conversation

YOUR ROLE:
Just have a natural, friendly chat about: ${topicList}

CONVERSATION STYLE:
- Keep responses SHORT (2-3 sentences maximum)
- Speak naturally like texting a friend
- Use contractions (I'm, you're, it's, we'll, can't)
- Show genuine interest and enthusiasm
- Ask follow-up questions to keep the conversation flowing

HOW TO HELP (WITHOUT TEACHING):
When your friend says something unclear, just naturally rephrase it in your response:
❌ DON'T: "You should say 'I went' not 'I go'. That's past tense."
✅ DO: "Oh cool! So you went there yesterday? How was it?"

Friend says: "I go to beach yesterday"
You respond: "Nice! So you went to the beach yesterday? Did you swim?"
(Natural correction without mentioning grammar)

TOPICS:
Only chat about: ${topicList}
If they mention other things, gently redirect: "That sounds fun! But tell me more about [topic]..."

FEEDBACK INSTRUCTIONS (ONLY when specifically requested):
When asked for feedback at the end, give honest but encouraging feedback in a friendly way:
- Mention what they did well
- Point out 1-2 areas to work on (without using grammar terms)
- Keep it positive and motivating
- Example: "You're really getting better at describing things! One thing to work on - try using more past tense words when talking about yesterday. But honestly, you're doing great!"

Remember: You're a friend, not a teacher. Keep it fun, natural, and conversational!`;

      ws.send(JSON.stringify({
        type: 'setup',
        systemInstruction,
        userId,
        userName
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

      if (message.type === 'feedback') {
        console.log('📝 Feedback received');
        saveFeedbackToDatabase(message.feedback);
      }

      if (message.type === 'turn_complete') {
        console.log('✅ Turn complete');
        setIsSpeaking(false);
        if (!isFeedbackTime) {
          setStatus('Listening...');
        } else {
          setStatus('Feedback received!');
        }
      }

      if (message.type === 'interrupted') {
        console.log('⚠️ Interrupted');
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
      setConversationStarted(false);
      if (!isFeedbackTime) {
        setStatus('Click to start');
      }
    };
  }, [userTopics, userName, userId, toast, isFeedbackTime]);

  const saveFeedbackToDatabase = async (feedback: string) => {
    try {
      await saveConversationFeedback({
        userId,
        userName,
        feedback,
        topics: userTopics?.filter(t => t.enabled).map(t => t.name),
        duration: 15 * 60 - timeRemaining,
        date: new Date().toISOString()
      });
      console.log('✅ Feedback saved to database');
    } catch (error) {
      console.error('❌ Error saving feedback:', error);
    }
  };

  const stopAllAudioSources = useCallback(() => {
    console.log('🛑 Stopping all audio sources');
    for (const source of audioSourcesRef.current.values()) {
      try {
        source.stop();
      } catch (e) {
        // ignore
      }
      audioSourcesRef.current.delete(source);
    }
    nextStartTimeRef.current = 0;
    setIsSpeaking(false);
  }, []);

  const playAudio = useCallback(async (base64Data: string) => {
    setIsSpeaking(true);
    setStatus('L.I.A. is speaking...');

    try {
      // Use native sample rate for better compatibility
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('🎵 Output AudioContext created, sample rate:', outputAudioContextRef.current.sampleRate);
      }
      
      if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
      }

      const decodedData = decode(base64Data);
      const wavBuffer = createWavHeader(decodedData, 24000, 1);
      const audioBuffer = await outputAudioContextRef.current.decodeAudioData(wavBuffer);

      const currentTime = outputAudioContextRef.current.currentTime;
      
      // Better scheduling - prevent audio cutting
      if (nextStartTimeRef.current < currentTime + 0.05) {
        nextStartTimeRef.current = currentTime + 0.05;
      }

      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioContextRef.current.destination);
      
      source.addEventListener('ended', () => {
        audioSourcesRef.current.delete(source);
        if (audioSourcesRef.current.size === 0) {
          console.log('🔇 Audio playback ended');
          setIsSpeaking(false);
          nextStartTimeRef.current = 0;
          if (isConnected && !isFeedbackTime) {
            setStatus('Listening...');
          } else if (isFeedbackTime) {
            setStatus('Feedback complete!');
          }
        }
      });

      source.start(nextStartTimeRef.current);
      console.log(`🔊 Audio chunk: ${audioBuffer.duration.toFixed(2)}s`);
      
      // Add small gap between chunks to prevent speed-up
      nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration + 0.03;
      audioSourcesRef.current.add(source);

    } catch (error) {
      console.error('❌ Audio playback error:', error);
      setIsSpeaking(false);
      setStatus('Error');
      nextStartTimeRef.current = 0;
    }
  }, [isConnected, isFeedbackTime]);

  const startListening = useCallback(async () => {
    // Don't start if in feedback time
    if (isFeedbackTime) {
      console.log('⏰ Feedback time - not starting microphone');
      return;
    }

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
  
      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
          sampleRate: 16000 
        });
        console.log('🎵 Input AudioContext at 16kHz');
      }
      
      if (inputAudioContextRef.current.state === 'suspended') {
        await inputAudioContextRef.current.resume();
      }
  
      const source = inputAudioContextRef.current.createMediaStreamSource(stream);
      streamSourceRef.current = source;
  
      const bufferSize = 256;
      const processor = inputAudioContextRef.current.createScriptProcessor(bufferSize, 1, 1);
      scriptProcessorRef.current = processor;
  
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isListeningRef.current) {
          const inputBuffer = e.inputBuffer;
          const pcmData = inputBuffer.getChannelData(0);
          
          const audioBlob = createBlob(pcmData);
  
          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: audioBlob.data
          }));
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
  
      console.log('🎤 Started listening');
    } catch (error) {
      console.error('❌ Microphone error:', error);
      toast({ title: 'Microphone Error', description: 'Please allow microphone access', variant: 'destructive' });
      setStatus('Click to start');
    }
  }, [toast, isFeedbackTime]);

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
    // Don't allow interaction during feedback
    if (isFeedbackTime && isSpeaking) {
      console.log('⏰ Waiting for feedback...');
      return;
    }

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
    } else if (!isSpeaking && !isFeedbackTime) {
      startListening();
    }
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
      {/* Timer Display */}
      {conversationStarted && (
        <div className="mb-4 flex items-center gap-2 text-white/80">
          <Clock className="w-5 h-5" />
          <span className="text-lg font-mono">
            {formatTime(timeRemaining)}
          </span>
          {timeRemaining <= 60 && (
            <span className="text-sm text-yellow-400 ml-2">Feedback time!</span>
          )}
        </div>
      )}

      <div
        onClick={handleClick}
        className={cn(
          'relative rounded-full overflow-hidden w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 shadow-2xl cursor-pointer',
          {
            'ring-4 ring-green-400 scale-105': isListening,
            'ring-4 ring-blue-400 animate-pulse': isSpeaking,
            'hover:scale-105': !isSpeaking && isConnected && !isFeedbackTime,
            'opacity-75 cursor-not-allowed': isSpeaking || (isFeedbackTime && !isListening),
            'ring-4 ring-yellow-400': isFeedbackTime
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
          {isConnected 
            ? `Today's Topics: ${userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'General Conversation'}` 
            : 'Your AI Language Learning Assistant'}
        </p>
      </div>
    </div>
  );
}