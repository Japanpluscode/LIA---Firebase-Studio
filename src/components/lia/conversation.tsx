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
  const [timeRemaining, setTimeRemaining] = useState(10 * 60); // 10 minutes
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

  // Timer countdown
  useEffect(() => {
    if (conversationStarted && timeRemaining > 0 && !isFeedbackTime) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;
          
          // Trigger feedback at 2 minutes remaining (120 seconds)
          if (newTime === 120 && !isFeedbackTime) {
            console.log('⏰ Time for feedback!');
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
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
        }
      };
    }
  }, [conversationStarted, timeRemaining, isFeedbackTime]);

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
    console.log('⏰ Requesting feedback from LIA');
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'request_feedback'
      }));
      setStatus('Preparing your feedback...');
      toast({ 
        title: 'Feedback Time!', 
        description: 'LIA is preparing your feedback...' 
      });
    }
  }, [toast]);

  const endConversation = useCallback(() => {
    console.log('⏹️ Ending conversation');
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
      setStatus('Connecting to LIA...');

      const topicList = userTopics?.filter(t => t.enabled).map(t => t.name).join(', ') || 'general English conversation';
      
      const systemInstruction = `You are LIA, a friendly English conversation partner and tutor helping ${userName || 'your friend'} practice speaking English naturally.

CRITICAL RULES:
1. YOU MUST SPEAK ONLY IN ENGLISH - NEVER speak Portuguese
2. YOU ARE BOTH: A conversation friend AND a supportive tutor
3. Your main job is to KEEP THE CONVERSATION FLOWING with questions
4. Response length: Usually 2-3 sentences, but can be longer if context requires (max 5 sentences)

LANGUAGE HANDLING:
- The student is Brazilian learning English
- If they speak Portuguese, you UNDERSTAND it but RESPOND ONLY IN ENGLISH
- Example: Student says "Eu gosto de viajar" → You say: "Oh, you like to travel! That's awesome! Where's your favorite place you've been?"
- NEVER respond in Portuguese

YOUR DUAL ROLE:

AS A FRIEND:
- Keep conversations natural and engaging
- Ask follow-up questions to dig deeper
- Show genuine interest and enthusiasm
- Share brief relatable thoughts when natural

AS A TUTOR:
- Listen carefully to how they speak
- Model correct English naturally (don't explicitly correct)
- Notice their progress and challenges
- At the end, provide honest, helpful feedback

CONVERSATION PATTERN:
1. Student speaks (English or Portuguese)
2. You respond in English (2-3 sentences, sometimes more if needed)
3. You ask a follow-up question
4. Keep the conversation flowing naturally

EXAMPLE CONVERSATIONS:

Student: "I like pizza"
You: "Pizza is delicious! I love it too. What's your favorite topping? Do you prefer thin crust or thick crust?"

Student: "Eu viajei para praia" (Portuguese)
You: "Nice! So you went to the beach. That sounds relaxing. Did you go with friends or family? What did you do there?"

Student: "Yesterday I go to restaurant"
You: "Oh cool, you went to a restaurant yesterday! That sounds fun. What kind of food did they have? Did you try something new?"

RESPONSE LENGTH GUIDE:
- Simple questions from student: 2-3 sentences
- Complex topics or stories: 3-5 sentences
- Never just one word or one sentence
- Never more than 5 sentences

TOPICS TO DISCUSS:
${topicList}

If student talks about something else, gently redirect: "That's interesting! But let's focus on [topic] - how about you tell me..."

FEEDBACK SESSION (Last 2 minutes):
When it's time for feedback, you'll be asked specifically. Then provide:
1. What they did really well (be specific and encouraging)
2. One or two areas to work on (without using grammar terms)
3. An encouraging final comment
4. Keep feedback to 4-5 sentences total
5. SPEAK ONLY IN ENGLISH for feedback

Example feedback:
"You did great today! You're really good at describing places and I noticed you used past tense well when talking about your trip. One thing to practice is using more connecting words like 'because' or 'so' to make longer sentences. But honestly, you're making awesome progress! Keep it up!"

Remember: 
- ENGLISH ONLY, always
- Be a supportive friend AND helpful tutor
- Keep conversation flowing with questions
- 2-3 sentences normally, up to 5 when needed
- Model correct English naturally without explicit corrections`;

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
        console.log('⚠️ User interrupted - stopping audio');
        stopAllAudioSources();
        setIsSpeaking(false);
        setStatus('Listening...');
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
        duration: 10 * 60 - timeRemaining, // 10 minutes
        date: new Date().toISOString()
      });
      console.log('✅ Feedback saved to database');
    } catch (error) {
      console.error('❌ Error saving feedback:', error);
    }
  };

  const stopAllAudioSources = useCallback(() => {
    console.log('🛑 Stopping all audio (user interruption)');
    for (const source of audioSourcesRef.current.values()) {
      try {
        source.stop();
      } catch (e) {
        // ignore
      }
      audioSourcesRef.current.delete(source);
    }
    nextStartTimeRef.current = 0;
  }, []);

  const playAudio = useCallback(async (base64Data: string) => {
    setIsSpeaking(true);
    setStatus('LIA is speaking...');

    try {
      if (!outputAudioContextRef.current) {
        // Use native sample rate for smoother playback
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('🎵 Output AudioContext created, sample rate:', outputAudioContextRef.current.sampleRate);
      }
      
      if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
      }

      const decodedData = decode(base64Data);
      
      // Create WAV header - match Gemini's output
      const wavBuffer = createWavHeader(decodedData, 24000, 1);
      const audioBuffer = await outputAudioContextRef.current.decodeAudioData(wavBuffer);

      // Simple gain for volume - no complex filtering that might cause issues
      const gainNode = outputAudioContextRef.current.createGain();
      gainNode.gain.value = 1.1; // Slight boost

      const currentTime = outputAudioContextRef.current.currentTime;
      
      // More aggressive scheduling to prevent gaps/buffering
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }

      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      
      // Direct connection - simpler path for better reliability
      source.connect(gainNode);
      gainNode.connect(outputAudioContextRef.current.destination);
      
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
      console.log(`🔊 Audio chunk: ${audioBuffer.duration.toFixed(2)}s starting at ${nextStartTimeRef.current.toFixed(2)}s`);
      
      // Tighter scheduling - almost no gap
      nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
      audioSourcesRef.current.add(source);

    } catch (error) {
      console.error('❌ Audio playback error:', error);
      setIsSpeaking(false);
      setStatus('Error');
      nextStartTimeRef.current = 0;
    }
  }, [isConnected, isFeedbackTime]);

  const startListening = useCallback(async () => {
    if (isFeedbackTime) {
      console.log('⏰ Feedback time - not starting microphone');
      return;
    }

    // If LIA is speaking, stop her (user interruption)
    if (isSpeaking) {
      console.log('🤚 User interrupting LIA');
      stopAllAudioSources();
      // Send interruption signal to server
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'user_interrupted' }));
      }
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
  }, [toast, isFeedbackTime, isSpeaking, stopAllAudioSources]);

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
    } else if (isSpeaking) {
      // Allow clicking while LIA speaks to interrupt
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
      {conversationStarted && (
        <div className="mb-4 flex items-center gap-2 text-white/80">
          <Clock className="w-5 h-5" />
          <span className="text-lg font-mono">
            {formatTime(timeRemaining)}
          </span>
          {timeRemaining <= 120 && (
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