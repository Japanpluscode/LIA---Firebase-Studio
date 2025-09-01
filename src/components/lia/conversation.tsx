'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAiResponse, saveConversation, getRandomTopic, Message } from '@/app/actions';
import { textToSpeech } from '@/ai/flows/tts';
import { useToast } from '@/hooks/use-toast';

// Silence detection parameters
const SILENCE_THRESHOLD = 0.01; // Volume threshold to consider as silence
const SILENCE_DURATION = 1500; // Milliseconds of silence to trigger end of speech

const LiaAvatar = () => (
  <svg
    className="absolute inset-0 w-full h-full"
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="L.I.A. Avatar"
  >
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="70%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.75 }} />
        <stop offset="95%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0 }} />
      </radialGradient>
    </defs>
    <circle
      cx="50"
      cy="50"
      r="50"
      fill="url(#glow)"
      className="opacity-50"
    />
    <circle
      cx="50"
      cy="50"
      r="40"
      fill="hsl(var(--background))"
      stroke="hsl(var(--primary))"
      strokeWidth="1"
    />
  </svg>
);


export default function Conversation({ userId, userName }: { userId: string; userName: string; }) {
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const { toast } = useToast();
  
  const playAudio = useCallback((audioDataUri: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = audioDataUri;
      audioPlayerRef.current.play().catch(e => console.error("Audio play failed", e));
      setIsAiSpeaking(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (isListening || isAiSpeaking) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        setIsProcessing(true);
        // For this prototype, we'll simulate speech-to-text with a placeholder user message.
        const simulatedUserText = "I enjoy traveling to new places and trying different kinds of food.";

        const userMessage: Message = {
          id: Date.now(),
          sender: 'user',
          text: simulatedUserText,
        };
        
        await handleAiResponse(userMessage);

        setIsProcessing(false);
      };

      mediaRecorderRef.current.start();
      setIsListening(true);

      // Start silence detection
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const checkSilence = () => {
        if (!analyserRef.current || !isListeningRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);
        const volume = dataArray.reduce((acc, val) => acc + Math.abs(val - 128), 0) / dataArray.length / 128;

        if (volume < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              stopListening();
            }, SILENCE_DURATION);
          }
        } else {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }
        if (isListeningRef.current) {
          requestAnimationFrame(checkSilence);
        }
      };
      checkSilence();

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description: 'Please enable microphone permissions in your browser settings.',
      });
      setIsListening(false);
    }
  }, [isListening, isAiSpeaking, toast, stopListening]);

  const handleAiResponse = async (userMessage: Message) => {
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsProcessing(true);
    
    const { text: aiText, audio: aiAudio } = await getAiResponse(userId, topic, updatedMessages);
    
    setIsProcessing(false);

    const aiMessage: Message = { id: Date.now() + 1, sender: 'ai', text: aiText };
    const finalMessages = [...updatedMessages, aiMessage];
    setMessages(finalMessages);
    
    console.log("AI says: ", aiText);
    if(aiAudio) {
      playAudio(aiAudio);
    }

    await saveConversation(userId, topic, finalMessages);
  };

  const handleStartConversation = async () => {
    setIsProcessing(true);
    setConversationStarted(true);
    
    const randomTopic = await getRandomTopic(userId);
    setTopic(randomTopic);

    const firstAiText = `Hello ${userName}! I'm L.I.A., your personal language immersion assistant. Let's talk about ${randomTopic}. To start, tell me what you enjoy about this topic.`;

    const { audio } = await textToSpeech(firstAiText);
    
    const aiMessage: Message = { id: Date.now(), sender: 'ai', text: firstAiText };
    setMessages([aiMessage]);
    
    setIsProcessing(false);
    if (audio) {
      playAudio(audio);
    }
  };
  
  // Refs to track state in callbacks
  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Audio player event listener
  useEffect(() => {
    const player = audioPlayerRef.current;
    if (player) {
      const handleAudioEnd = () => {
        setIsAiSpeaking(false);
        startListening();
      };
      player.addEventListener('ended', handleAudioEnd);
      return () => {
        player.removeEventListener('ended', handleAudioEnd);
      };
    }
  }, [startListening]);

  const buttonState = () => {
    if (!conversationStarted) return 'start';
    if (isProcessing) return 'processing';
    if (isAiSpeaking) return 'speaking';
    if (isListening) return 'listening';
    return 'idle';
  };

  const currentButtonState = buttonState();

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div className="relative mb-8">
        <button
          onClick={currentButtonState === 'start' ? handleStartConversation : (currentButtonState === 'listening' ? stopListening : startListening)}
          disabled={currentButtonState === 'processing' || currentButtonState === 'speaking'}
          className={cn(
            'relative rounded-full w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
              <p className="text-lg font-medium text-gray-300">{isProcessing ? 'L.I.A. is thinking...' : 'L.I.A. is speaking...'}</p>
            </div>
          )}
          {currentButtonState === 'start' && (
             <p className="text-lg font-medium text-gray-300">Click the avatar to start the conversation.</p>
          )}
          {currentButtonState === 'idle' && (
             <p className="text-lg font-medium text-gray-300">Click the avatar to speak.</p>
          )}
      </div>
      
      <audio ref={audioPlayerRef} hidden />
    </div>
  );
}
