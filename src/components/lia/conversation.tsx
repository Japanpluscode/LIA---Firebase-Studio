'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Waves } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAiResponse, saveConversation } from '@/app/actions';
import type { Message } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

const topics = ['Travel', 'Food', 'Hobbies', 'Work', 'Technology'];

// Silence detection parameters
const SILENCE_THRESHOLD = 0.01; // Volume threshold to consider as silence
const SILENCE_DURATION = 1500; // Milliseconds of silence to trigger end of speech

export default function Conversation() {
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

  useEffect(() => {
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    setTopic(randomTopic);
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

  const handleAiResponse = async (userMessage: Message) => {
    const conversationHistory = [...messages, userMessage]
      .map((msg) => `${msg.sender === 'user' ? 'Student' : 'L.I.A.'}: ${msg.text}`)
      .join('\n');

    setIsAiSpeaking(true);
    const aiText = await getAiResponse(topic, conversationHistory);
    setIsAiSpeaking(false);

    const aiMessage: Message = { id: Date.now() + 1, sender: 'ai', text: aiText };
    setMessages((prev) => [...prev, aiMessage]);
    
    // For now, we are not playing the audio, but we'll get there.
    console.log("AI says: ", aiText);

    await saveConversation('anonymous_user', topic, [...messages, userMessage, aiMessage]);
    
    // After AI speaks, start listening again
    startListening(); 
  };


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
        
        setMessages((prev) => [...prev, userMessage]);
        
        await handleAiResponse(userMessage);

        setIsProcessing(false);
      };

      mediaRecorderRef.current.start();
      setIsListening(true);

      // Start silence detection
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      const checkSilence = () => {
        if (!analyserRef.current) return;
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
        if (isListening) {
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
  }, [isListening, isAiSpeaking, toast, stopListening, messages, topic]);


  const handleStartConversation = async () => {
    setIsProcessing(true);
    setConversationStarted(true);
    
    const firstAiText = `Hello! I'm L.I.A., your personal language immersion assistant. Let's talk about ${topic}. To start, tell me what you enjoy about this topic.`;

    const aiMessage: Message = { id: Date.now(), sender: 'ai', text: firstAiText };
    setMessages([aiMessage]);
    
    setIsAiSpeaking(true);
    // Simulate AI speaking time before listening starts
    setTimeout(() => {
      setIsAiSpeaking(false);
      setIsProcessing(false);
      startListening();
    }, 2000);
  };

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
          onClick={handleStartConversation}
          disabled={currentButtonState !== 'start'}
          className={cn(
            'relative rounded-full w-48 h-48 md:w-64 md:h-64 flex items-center justify-center shadow-2xl transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 overflow-hidden',
            {
              'cursor-pointer hover:opacity-90': currentButtonState === 'start',
              'cursor-not-allowed opacity-80': currentButtonState !== 'start',
              'animate-pulse-strong': currentButtonState === 'speaking' || currentButtonState === 'processing' || currentButtonState === 'listening'
            }
          )}
          style={{
             boxShadow: '0 0 20px 5px hsla(var(--primary) / 0.5), 0 0 40px 10px hsla(var(--primary) / 0.3)',
          }}
          aria-label="Start Conversation"
        >
          <Image
            src="https://i.ibb.co/R4WTd2z/OIG3-T0-Yl-ICl-H.png"
            alt="L.I.A. Avatar"
            fill
            unoptimized
            className="object-cover rounded-full"
          />
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
              <p className="text-lg font-medium text-gray-300">L.I.A. is thinking...</p>
            </div>
          )}
          {currentButtonState === 'start' && (
             <p className="text-lg font-medium text-gray-300">Click the avatar to start the conversation.</p>
          )}
      </div>
      
      <audio ref={audioPlayerRef} hidden />
    </div>
  );
}
