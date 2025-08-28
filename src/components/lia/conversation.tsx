'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Mic, Waves } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { getAiResponse, saveConversation } from '@/app/actions';
import type { Message } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

// List of topics for the AI to choose from
const topics = ['Travel', 'Food', 'Hobbies', 'Work', 'Technology'];

export default function Conversation() {
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const { toast } = useToast();

  // Pick a random topic when the component mounts
  useEffect(() => {
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    setTopic(randomTopic);
  }, []);

  const handleStartConversation = async () => {
    setIsProcessing(true);
    setConversationStarted(true);
    
    // The AI starts the conversation
    const firstAiText = `Hello! I'm L.I.A., your personal language immersion assistant. Let's talk about ${topic}. To start, tell me what you enjoy about this topic.`;

    const aiMessage: Message = { id: Date.now(), sender: 'ai', text: firstAiText };
    setMessages([aiMessage]);
    
    // For now, we are not playing audio for the first message to simplify the flow.
    // This can be added later.
    setIsProcessing(false);
  };
  
  const handleRecordClick = async () => {
    if (!conversationStarted) {
      await handleStartConversation();
      return;
    }

    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setIsProcessing(true); // Show processing indicator
      }
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          // Here you would typically send the audio to a speech-to-text service.
          // For this prototype, we'll simulate it with a placeholder user message.
          const simulatedUserText = "I enjoy traveling to new places and trying different kinds of food.";

          const userMessage: Message = {
            id: Date.now(),
            sender: 'user',
            text: simulatedUserText,
          };
          
          setMessages((prev) => [...prev, userMessage]);

          // Get AI response
          const conversationHistory = [...messages, userMessage]
            .map((msg) => `${msg.sender === 'user' ? 'Student' : 'L.I.A.'}: ${msg.text}`)
            .join('\n');
          
          setIsAiSpeaking(true);
          const aiText = await getAiResponse(topic, conversationHistory);
          setIsAiSpeaking(false);
          
          const aiMessage: Message = { id: Date.now() + 1, sender: 'ai', text: aiText };
          setMessages((prev) => [...prev, aiMessage]);

          // Simulate playing AI audio response.
          // In a real app, this would be a text-to-speech service call.
          console.log("AI says: ", aiText);

          setIsProcessing(false);
          
          await saveConversation('anonymous_user', topic, [...messages, userMessage, aiMessage]);
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error('Error accessing microphone:', error);
        toast({
          variant: 'destructive',
          title: 'Microphone Access Denied',
          description: 'Please enable microphone permissions in your browser settings.',
        });
      }
    }
  };


  const buttonState = () => {
    if (!conversationStarted) return 'start';
    if (isProcessing || isAiSpeaking) return 'processing';
    if (isRecording) return 'recording';
    return 'idle';
  };

  const currentButtonState = buttonState();

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <div className="relative mb-8">
        <Avatar
          className={cn(
            'h-48 w-48 md:h-64 md:w-64 border-4 border-primary/20 shadow-lg',
            (isAiSpeaking || isProcessing) && 'animate-pulse'
          )}
        >
          <AvatarImage src="https://i.imgur.com/3l3d5iS.png" alt="L.I.A. Avatar" />
          <AvatarFallback>
            <Bot className="h-24 w-24 text-primary" />
          </AvatarFallback>
        </Avatar>
      </div>

      <button
        onClick={handleRecordClick}
        disabled={isProcessing || isAiSpeaking}
        className={cn(
          'rounded-full w-24 h-24 md:w-28 md:h-28 flex items-center justify-center shadow-2xl transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          {
            'bg-primary hover:bg-primary/90': currentButtonState === 'idle' || currentButtonState === 'start',
            'bg-red-500 hover:bg-red-600 animate-pulse': currentButtonState === 'recording',
            'bg-gray-400 cursor-not-allowed': currentButtonState === 'processing',
          }
        )}
        aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
      >
        {currentButtonState === 'recording' && <Waves className="h-10 w-10 text-white" />}
        {(currentButtonState === 'idle' || currentButtonState === 'start') && <Mic className="h-10 w-10 text-primary-foreground" />}
        {currentButtonState === 'processing' && (
           <div className="h-10 w-10">
              <div className="h-3 w-3 bg-white rounded-full animate-pulse [animation-delay:-0.3s]"></div>
              <div className="h-3 w-3 bg-white rounded-full animate-pulse [animation-delay:-0.15s]"></div>
              <div className="h-3 w-3 bg-white rounded-full animate-pulse"></div>
            </div>
        )}
      </button>
       <p className="mt-6 text-muted-foreground text-center">
        {
          {
            'start': 'Click the button to start the conversation.',
            'idle': 'Click to speak.',
            'recording': 'Recording...',
            'processing': 'L.I.A. is thinking...'
          }[currentButtonState]
        }
      </p>
      
      <audio ref={audioPlayerRef} hidden />
    </div>
  );
}
