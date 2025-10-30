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

const SILENCE_THRESHOLD = 0.005;
const SILENCE_DURATION = 2000;
const BUFFER_TIME = 30;

export default function Conversation({ userId, userName }: ConversationProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState('Click to start');
  const [userTopics, setUserTopics] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<string>('');
  const [userDuration, setUserDuration] = useState(5);
  const [userInstructions, setUserInstructions] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(5 * 60);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isPreparingFeedback, setIsPreparingFeedback] = useState(false);
  const [isFeedbackTime, setIsFeedbackTime] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [inBufferTime, setInBufferTime] = useState(false);

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
  const logCountRef = useRef(0);
  const startTimeRef = useRef<number>(0);
  const isCleaningUpRef = useRef(false);
  const baseTimeRef = useRef(5 * 60);

  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('📊 Fetching user data for:', userId);
        
        const user = await getUser(userId);
        console.log('👤 User data received:', user);
        
        if (user) {
          setUserProfile(user.profile || '');
          
          // Use conversationDuration from database
          const duration = user.conversationDuration || 5;
          setUserDuration(duration);
          const durationInSeconds = duration * 60;
          setTimeRemaining(durationInSeconds);
          baseTimeRef.current = durationInSeconds;
          console.log('⏱️ Duration set to:', duration, 'minutes (', durationInSeconds, 'seconds)');
          
          // Use conversationInstructions from database
          const instructions = user.conversationInstructions || '';
          setUserInstructions(instructions);
          console.log('📝 Instructions:', instructions || '(none)');
        }
        
        const topics = await getTopics(userId);
        setUserTopics(topics);
        console.log('📚 Topics loaded:', topics.length, 'topics');
        
      } catch (error) {
        console.error("❌ Failed to fetch data", error);
        setUserTopics([{ name: 'general conversation', enabled: true }]);
      }
    };
    fetchData();
  }, [userId]);

  const startRecording = useCallback(async () => {
    if (isRecording || isCleaningUpRef.current) {
      console.log('⚠️ Already recording or cleaning up');
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
      
      console.log('✅ Microphone access granted');
      
      const audioCtx = inputAudioContextRef.current;
      if (!audioCtx) {
        console.error('❌ No audio context');
        return;
      }

      sourceNodeRef.current = audioCtx.createMediaStreamSource(mediaStreamRef.current);
      sourceNodeRef.current.connect(inputNodeRef.current!);
      
      const bufferSize = 256;
      scriptProcessorRef.current = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      console.log('🎛️ Audio processor created with threshold:', SILENCE_THRESHOLD);

      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (logCountRef.current % 100 === 0) {
            console.log('⚠️ WebSocket not ready');
          }
          logCountRef.current++;
          return;
        }

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        let sum = 0;
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i] * pcmData[i];
        }
        const rms = Math.sqrt(sum / pcmData.length);
        
        if (logCountRef.current % 50 === 0) {
          console.log('🎚️ Audio level:', rms.toFixed(4), 'Threshold:', SILENCE_THRESHOLD);
        }
        logCountRef.current++;
        
        if (rms > SILENCE_THRESHOLD) {
          if (!isSpeakingRef.current) {
            console.log('🎤 User started speaking! (RMS:', rms.toFixed(4), ')');
            isSpeakingRef.current = true;
            setStatus('Listening to you...');
          }
          silenceStartRef.current = Date.now();
          
          if (logCountRef.current % 50 === 0) {
            console.log('📤 Sending audio chunk');
          }
          
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [createBlob(pcmData)]
            }
          }));
        } else if (isSpeakingRef.current) {
          const silenceDuration = Date.now() - silenceStartRef.current;
          
          if (logCountRef.current % 50 === 0) {
            console.log('🤫 Silence duration:', silenceDuration, 'ms');
          }
          
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [createBlob(pcmData)]
            }
          }));
          
          if (silenceDuration > SILENCE_DURATION) {
            console.log('🤐 Silence detected - stopping audio stream');
            isSpeakingRef.current = false;
            setStatus('Processing...');
          }
        }
      };

      sourceNodeRef.current.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioCtx.destination);

      setIsRecording(true);
      setStatus('Listening...');
      console.log('✅ Recording started - speak now!');
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
    if (!isRecording || isCleaningUpRef.current) return;

    console.log('🛑 Stopping recording...');
    setIsRecording(false);

    if (scriptProcessorRef.current && sourceNodeRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting audio nodes:', e);
      }
    }

    scriptProcessorRef.current = null;
    sourceNodeRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setStatus('Recording stopped');
  }, [isRecording]);

  useEffect(() => {
    if (feedbackSaved && !isSpeaking && timerIntervalRef.current) {
      console.log('✅ Feedback complete and LIA stopped speaking - ending conversation NOW');
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
      
      const actualDuration = timeRemaining < 0 ? baseTimeRef.current : baseTimeRef.current - timeRemaining;
      const mins = Math.floor(actualDuration / 60);
      const secs = actualDuration % 60;
      
      setStatus(`Conversation finished! Time used: ${mins}:${secs.toString().padStart(2, '0')}`);
      setInBufferTime(false);
      
      toast({ 
        title: 'Session Complete!', 
        description: `Great job! Duration: ${mins}:${secs.toString().padStart(2, '0')}` 
      });
      
      stopRecording();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    }
  }, [feedbackSaved, isSpeaking, timeRemaining, toast, stopRecording]);

  const prepareForFeedback = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('⏰ Preparing for feedback (1 minute remaining) with natural interruption');
      setStatus('Wrapping up...');
      toast({ title: 'Almost done!', description: 'LIA will give feedback soon...' });
      
      wsRef.current.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ 
              text: `NATURAL WRAP-UP INSTRUCTION:
              
If I'm currently speaking, politely interrupt me by saying something like:
- "Sorry to interrupt, but our time is almost up! Let me wrap up what we were talking about..."
- "I hate to cut you off, but we need to finish soon. Just to complete our thought..."
- "Hold on - we're running out of time! Let me quickly finish this point..."

If I just finished speaking or there's a natural pause, transition smoothly:
- "Perfect timing! Our practice session is almost done. Let me just wrap this up..."
- "Great! We're almost at the end of our time. To finish up..."
- "Excellent! Before we end, let me quickly complete this thought..."

After interrupting/transitioning naturally, wrap up the current topic in ONE SHORT SENTENCE, then say: "In just a moment, I'll give you some feedback about our conversation today."

Keep it VERY BRIEF and NATURAL - like a real friend would do!` 
            }]
          }],
          turnComplete: true
        }
      }));
    }
  }, [toast]);

  const requestFeedback = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('📝 Requesting feedback from LIA (30 seconds remaining)');
      setStatus('Getting feedback...');
      toast({ title: 'Feedback Time!', description: 'LIA is preparing your feedback...' });
      
      wsRef.current.send(JSON.stringify({
        clientContent: {
          turns: [{
            role: 'user',
            parts: [{ 
              text: `TIME FOR FEEDBACK:

Now say: "Okay! Now for your feedback..."

Then give me HONEST, SPECIFIC feedback in just 2-3 sentences:

1. ONE specific grammar mistake I made (quote exactly what I said and what I should have said)
2. ONE vocabulary suggestion (a better word I could use)
3. ONE thing I did really well today

Keep it friendly, encouraging, and SPECIFIC with real examples from our conversation!

After feedback, say something like:
- "Great job today! Keep practicing and I'll see you next time!"
- "You're doing awesome! Can't wait to chat again!"
- "Nice work! See you in our next session!"

Make it feel natural and warm, like a friend saying goodbye!` 
            }]
          }],
          turnComplete: true
        }
      }));
    }
  }, [toast]);

  useEffect(() => {
    if (conversationStarted && !feedbackSaved) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;
          
          if (newTime === 60 && !isPreparingFeedback) {
            setIsPreparingFeedback(true);
            prepareForFeedback();
          }
          
          if (newTime === 30 && !isFeedbackTime) {
            setIsFeedbackTime(true);
            requestFeedback();
          }
          
          if (newTime === 0 && !inBufferTime) {
            setInBufferTime(true);
            setStatus('Extra time for feedback...');
            toast({ 
              title: 'Finishing up', 
              description: 'LIA is completing your feedback' 
            });
            return -1;
          }
          
          if (newTime <= -BUFFER_TIME && !feedbackSaved) {
            stopRecording();
            const totalDuration = baseTimeRef.current + BUFFER_TIME;
            const mins = Math.floor(totalDuration / 60);
            const secs = totalDuration % 60;
            setStatus(`Conversation finished! Total time: ${mins}:${secs.toString().padStart(2, '0')}`);
            toast({ 
              title: 'Session Complete!', 
              description: 'Thank you for practicing with LIA today!' 
            });
            
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.close();
            }
            return newTime;
          }
          
          return newTime;
        });
      }, 1000);
      
      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };
    }
  }, [conversationStarted, isPreparingFeedback, isFeedbackTime, feedbackSaved, inBufferTime, toast, prepareForFeedback, requestFeedback, stopRecording]);

  const formatTime = (seconds: number) => {
    if (seconds < 0) {
      const extraTime = Math.abs(seconds);
      return `+0:${extraTime.toString().padStart(2, '0')}`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const initAudio = useCallback(() => {
    if (inputAudioContextRef.current && 
        outputAudioContextRef.current && 
        inputAudioContextRef.current.state !== 'closed' && 
        outputAudioContextRef.current.state !== 'closed') {
      console.log('🔊 Audio contexts already initialized and open');
      return;
    }

    console.log('🔊 Initializing audio contexts...');
    
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close().catch(() => {});
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close().catch(() => {});
    }
    
    inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
    
    inputNodeRef.current = inputAudioContextRef.current.createGain();
    outputNodeRef.current = outputAudioContextRef.current.createGain();
    outputNodeRef.current.connect(outputAudioContextRef.current.destination);
    
    console.log('✅ Audio contexts initialized');
  }, []);

  const handleWebSocketMessage = useCallback(async (message: any) => {
    console.log('📨 Message received:', message);

    if (message.setupComplete) {
      console.log('✅ Setup complete');
      setConversationStarted(true);
      startTimeRef.current = Date.now();
      setStatus('Connected!');
      toast({ title: 'Ready!', description: 'LIA is listening!' });
      
      await startRecording();

      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          console.log('👋 Sending warm greeting request');
          wsRef.current.send(JSON.stringify({
            clientContent: {
              turns: [{
                role: 'user',
                parts: [{ text: `Hi LIA! My name is ${userName}. Please greet me warmly saying something like "Nice to talk to you!" or "Great to see you again!" (NOT "nice to meet you"), then ask me how my day is going. Keep it friendly and simple!` }]
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
          if (!audioCtx || audioCtx.state === 'closed') {
            console.error('❌ Audio context is closed, cannot play audio');
            continue;
          }

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
                
                if (!feedbackSaved) {
                  setStatus('Listening...');
                }
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
          if (isFeedbackTime && !feedbackSaved) {
            console.log('📝 Saving feedback to Firestore');
            try {
              await saveConversationFeedback({
                userId,
                userName,
                feedback: part.text,
                topics: userTopics?.filter(t => t.enabled).map(t => t.name) || ['general conversation'],
                duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
                date: new Date().toISOString()
              });
              setFeedbackSaved(true);
              console.log('✅ Feedback saved successfully');
              toast({ 
                title: 'Feedback Saved!', 
                description: 'Your teacher can review your progress.' 
              });
            } catch (error) {
              console.error('❌ Failed to save feedback:', error);
              toast({ 
                title: 'Error', 
                description: 'Failed to save feedback', 
                variant: 'destructive' 
              });
            }
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
        if (!feedbackSaved) {
          setStatus('Listening...');
        }
      }
    }
  }, [userId, userName, userTopics, isFeedbackTime, feedbackSaved, toast, startRecording]);

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

${userInstructions ? `⭐ SPECIAL TEACHER INSTRUCTIONS:
${userInstructions}

` : ''}YOUR PERSONALITY:
- Talk like a friend, not a teacher
- Keep it simple and natural
- Be patient and encouraging
- Show genuine interest in what they say
- Ask lots of questions to keep the conversation flowing

HOW TO TALK:
1. **CRITICAL INSTRUCTION: Speak clearly and at a slow, easy-to-understand pace. Enunciate your words carefully and pause between sentences so the student can understand everything. This is very important for language learning.**
2. Keep responses VERY SHORT - just 1-2 sentences maximum.
3. ALWAYS ask a question to keep the conversation going.
4. If student speaks Portuguese, understand it perfectly but ALWAYS respond in simple English.
5. NEVER speak Portuguese - only English responses.
6. Don't use complicated words or grammar terms.
7. If there's a pause or silence, ask a new question about the topics.

CONVERSATION FLOW:
- Start with a warm greeting and ask about their day
- Then naturally move to the practice topics: ${topicList}
- Keep asking questions related to these topics
- If the student stops talking, ask a related follow-up question
- Make the conversation feel natural and friendly

CRITICAL RULES:
- SPEAK SLOWLY AND CLEARLY - this is the most important thing
- MAXIMUM 1-2 sentences per response
- ALWAYS end with a question
- Use easy, everyday words
- Be encouraging and positive
- If they make mistakes, just say it correctly in your response naturally
- NEVER speak Portuguese - only understand it
- If student is silent for a moment, ask a new question about: ${topicList}
- Keep questions simple and related to the topics

NATURAL INTERRUPTIONS & TIME MANAGEMENT:
- When wrapping up or giving feedback, be NATURAL and POLITE
- If you need to interrupt, use friendly phrases like:
  * "Sorry to interrupt, but..."
  * "I hate to cut you off, but..."
  * "Hold that thought..."
- Make transitions smooth and conversational, like a real friend would

IMPORTANT FOR FEEDBACK:
- Pay close attention to grammar mistakes throughout our conversation
- Notice vocabulary choices and pronunciation patterns
- Remember specific examples of what they said
- Take note of patterns - do they forget articles? Mix up tenses?
- When giving feedback, quote exactly what they said wrong as examples

Remember: You're a FRIEND helping them practice English. SPEAK SLOWLY AND CLEARLY. Keep it fun, simple, natural!`;

        const setupMessage = {
          setup: {
            model: 'models/gemini-2.5-flash-native-audio-preview-09-2025',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { 
                  prebuiltVoiceConfig: { 
                    voiceName: 'Aoede' 
                  } 
                }
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
  }, [userId, userName, userProfile, userTopics, userInstructions, toast, handleWebSocketMessage, initAudio]);

  const handleClick = async () => {
    if (conversationStarted || isInitializingRef.current) {
      console.log('⚠️ Conversation already in progress or initializing');
      return;
    }
    
    console.log('👆 Avatar clicked - starting conversation');
    setStatus('Connecting...');
    await initConnection();
  };

  useEffect(() => {
    return () => {
      console.log('🧹 Component UNMOUNTING');
      if (isCleaningUpRef.current) return;
      isCleaningUpRef.current = true;
      
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      if (!conversationStarted) {
        hasInitializedRef.current = false;
        isInitializingRef.current = false;
        isCleaningUpRef.current = false;
        return;
      }
      
      stopRecording();
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      
      if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        inputAudioContextRef.current.close().catch(e => console.warn('Error closing input context:', e));
      }
      
      if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        outputAudioContextRef.current.close().catch(e => console.warn('Error closing output context:', e));
      }
      
      hasInitializedRef.current = false;
      isInitializingRef.current = false;
      isCleaningUpRef.current = false;
    };
  }, [conversationStarted, stopRecording]);

  return (
    <div className="flex flex-col items-center justify-center text-center w-full max-w-lg mx-auto">
      {conversationStarted && (
        <div className="mb-4 flex items-center gap-2 text-white/80">
          <Clock className="w-5 h-5" />
          <span className="text-lg font-mono">{formatTime(timeRemaining)}</span>
          {timeRemaining <= 60 && timeRemaining > 30 && <span className="text-sm text-orange-400 ml-2">Wrapping up...</span>}
          {timeRemaining <= 30 && timeRemaining > 0 && <span className="text-sm text-yellow-400 ml-2">Feedback time!</span>}
          {timeRemaining <= 0 && timeRemaining > -BUFFER_TIME && !feedbackSaved && <span className="text-sm text-blue-400 ml-2">Finishing feedback...</span>}
          {feedbackSaved && <span className="text-sm text-green-400 ml-2">✓ Complete!</span>}
        </div>
      )}

      <div 
        onClick={handleClick} 
        className={cn(
          'relative rounded-full overflow-hidden w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 shadow-2xl',
          { 
            'cursor-pointer hover:scale-105': !conversationStarted, 
            'ring-4 ring-green-400 scale-105': isRecording && !isSpeaking && timeRemaining > 0,
            'ring-4 ring-blue-400 animate-pulse': isSpeaking,
            'ring-4 ring-orange-400': isPreparingFeedback && !isFeedbackTime,
            'ring-4 ring-yellow-400': isFeedbackTime && timeRemaining > 0 && !feedbackSaved,
            'ring-4 ring-blue-400': timeRemaining <= 0 && timeRemaining > -BUFFER_TIME && !feedbackSaved,
            'ring-4 ring-green-500': feedbackSaved
          }
        )}>
        <LiaAvatar />
        {isRecording && !isSpeaking && timeRemaining > 0 && (
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