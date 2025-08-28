'use client';

import { useState, useRef, useEffect } from 'react';
import {
  CornerDownLeft,
  Bot,
  User,
  CheckCircle,
  BrainCircuit,
  Mic,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Message } from '@/app/actions';
import {
  getAiResponse,
  getGrammarCorrection,
  saveConversation,
} from '@/app/actions';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ConversationProps = {
  topic: string;
  onTopicChange: () => void;
};

export default function Conversation({ topic, onTopicChange }: ConversationProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: Date.now(),
      sender: 'ai',
      text: `Great! Let's talk about ${topic}. What's on your mind?`,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAiSpeaking =
    isLoading && messages[messages.length - 1]?.sender === 'user';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      sender: 'user',
      text: inputValue,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const correctedText = await getGrammarCorrection(userMessage.text);

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === userMessage.id && correctedText !== msg.text
          ? { ...msg, correction: correctedText }
          : msg
      )
    );

    const updatedHistoryMessages =
      correctedText !== userMessage.text
        ? [
            ...messages,
            { ...userMessage, correction: correctedText },
          ]
        : [...messages, userMessage];

    const conversationHistory = updatedHistoryMessages
      .map((msg) => `${msg.sender === 'user' ? 'Student' : 'L.I.A.'}: ${msg.text}`)
      .join('\n');

    const aiText = await getAiResponse(topic, conversationHistory);
    const aiMessage: Message = { id: Date.now() + 1, sender: 'ai', text: aiText };

    setMessages((prev) => [...prev, aiMessage]);
    setIsLoading(false);

    // Using a placeholder user ID since authentication is removed
    await saveConversation('anonymous_user', topic, [...updatedHistoryMessages, aiMessage]);
  };

  return (
    <Card className="w-full max-w-3xl h-[90vh] md:h-[85vh] flex flex-col shadow-2xl animate-in fade-in duration-500">
      <div className="flex items-center justify-between p-4 border-b">
        <Button variant="ghost" size="icon" onClick={onTopicChange} aria-label="Change Topic">
          <CornerDownLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-headline font-semibold text-primary">{topic}</h2>
        <div className="w-10"></div>
      </div>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex items-end gap-3',
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.sender === 'ai' && (
                  <Avatar className="h-8 w-8 border-2 border-primary">
                    <AvatarFallback>
                      <Bot className="text-primary" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg p-3 text-sm shadow-md',
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p>{message.text}</p>
                  {message.correction && (
                    <TooltipProvider delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="mt-2 pt-2 border-t border-primary-foreground/20 cursor-help">
                            <p className="text-xs flex items-center gap-1.5 opacity-90">
                              <CheckCircle className="h-3 w-3 flex-shrink-0" />
                              {message.correction}
                            </p>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Grammar suggestion</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                {message.sender === 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <User />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isAiSpeaking && (
              <div className="flex items-end gap-3 justify-start">
                <Avatar className="h-8 w-8 border-2 border-primary">
                  <AvatarFallback>
                    <Bot className="text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="max-w-[75%] rounded-lg p-3 bg-muted flex items-center gap-2 shadow-md">
                  <div className="h-2 w-2 bg-primary rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                  <div className="h-2 w-2 bg-primary rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                  <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </CardContent>

      <div className="border-t p-4 flex items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
        <Button
          size="lg"
          className={cn(
            'rounded-full w-20 h-20 shadow-lg transition-all',
            isAiSpeaking && 'animate-pulse-strong bg-accent'
          )}
          onClick={handleSendMessage}
          disabled={isLoading}
          aria-label="Send Message"
        >
          <Mic className="h-8 w-8 text-primary-foreground" />
        </Button>
      </div>
    </Card>
  );
}
