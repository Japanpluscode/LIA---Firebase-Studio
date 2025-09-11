'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Waves, Volume2, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Audio configuration for Gemini native audio
const SAMPLE_RATE = 24000; // Gemini prefers 24kHz
const CHUNK_SIZE = 4096; // Size of audio chunks to send

const LiaAvatar = () => (
  <svg
    className="absolute inset-0 w-full h-full"
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="L.I.A. Avatar"
  >
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop
          offset="70%"
          style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.75 }}
        />
        <stop
          offset="95%"
          style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0 }}
        />
      </radialGradient>
      <clipPath id="circleClip">
        <circle cx="50" cy="50" r="40" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#glow)" className="opacity-50" />
    <image
      href="https://firebasestorage.googleapis.com/v0/b/lia-language-app.firebasestorage.app/o/LIA.png?alt=media&token=c97d3cb6-1565-4205-bd13-80885907ff13"
      x="10"
      y="10"
      height="80"
      width="80"
      clipPath="url(#circleClip)"
      preserveAspectRatio="xMidYMid slice"
    />
    <circle
      cx="50"
      cy="50"
      r="40"
      fill="none"
      stroke="hsl(var(--primary))"
      strokeWidth="1"
    />
  </svg>
);

interface ConversationProps {
  userId: string;
  userName: string;
}

export default function Conversation({ userId, userName }: ConversationProps) {
  // Connection and states
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isListening, setIsListening] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [lastAiResponse, setLastAiResponse] = useState('');
  const [conversationActive, setConversationActive] = useState(false);
  
  // Audio refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isStreamingRef = useRef(false);

  const { toast } = useToast();

  // Convert Float32Array to PCM16
  const float32ToPCM16 = useCallback((float32Array: Float32Array): Int16Array => {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16;
  }, []);

  // Convert PCM16 back to Float32Array for playback
  const pcm16ToFloat32 = useCallback((pcm16: ArrayBuffer): Float32Array => {
    const dataView = new DataView(pcm16);
    const float32 = new Float32Array(pcm16.byteLength / 2);
    
    for (let i = 0; i < float32.length; i++) {
      const int16 = dataView.getInt16(i * 2, true); // little endian
      float32[i] = int16 / (int16 < 0 ? 0x8000 : 0x7FFF);
    }
    
    return float32;
  }, []);

  // Play audio response from Gemini
  const playAudioResponse = useCallback(async (audioData: string) => {
    try {
      setIsAiSpeaking(true);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Decode base64 PCM data
      const binaryData = atob(audioData);
      const bytes = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      
      // Convert to Float32Array
      const float32Data = pcm16ToFloat32(bytes.buffer);
      
      // Create audio buffer
      const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, SAMPLE_RATE);
      audioBuffer.copyToChannel(float32Data, 0);
      
      // Play audio
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        setIsAiSpeaking(false);
      };
      
      source.start();
      
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsAiSpeaking(false);
    }
  }, [pcm16ToFloat32]);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback(async (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'audio_response':
          console.log('🔊 Received personalized audio response from L.I.A.');
          if (data.audioData) {
            await playAudioResponse(data.audioData);
          }
          break;
          
        case 'text_response':
          console.log('💬 L.I.A. Response Text:', data.text);
          setLastAiResponse(data.text);
          break;
          
        case 'error':
          console.error('Server error:', data.message);
          setIsAiSpeaking(false);
          toast({
            variant: 'destructive',
            title: 'Conversation Error',
            description: data.message || 'An error occurred during the conversation.',
          });
          break;
          
        default:
          console.warn('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [playAudioResponse, toast]);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionState('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/conversation`;
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected for personalized conversation');
        setConnectionState('connected');
        wsRef.current = ws;
        
        // Send user setup message immediately after connection
        ws.send(JSON.stringify({
          type: 'user_setup',
          userId: userId
        }));
        
        console.log(`👤 Sent personalized setup for: ${userName} (${userId})`);
        
        toast({
          title: `Welcome ${userName}!`,
          description: 'L.I.A. is getting ready for your personalized conversation.',
        });
      };

      ws.onmessage = handleWebSocketMessage;

      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code);
        setConnectionState('disconnected');
        setIsAiSpeaking(false);
        setIsListening(false);
        wsRef.current = null;
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionState('disconnected');
        setIsAiSpeaking(false);
        setIsListening(false);
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      setConnectionState('disconnected');
    }
  }, [handleWebSocketMessage, toast, userId, userName]);

  // Send audio chunk to server
  const sendAudioChunk = useCallback((audioData: Float32Array, turnComplete: boolean = false) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      // Convert to PCM16 and then to base64
      const pcm16 = float32ToPCM16(audioData);
      const audioBuffer = new ArrayBuffer(pcm16.length * 2);
      const view = new DataView(audioBuffer);
      
      for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(i * 2, pcm16[i], true); // little endian
      }
      
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
      
      wsRef.current.send(JSON.stringify({
        type: 'audio_chunk',
        audioData: base64Audio,
        turnComplete
      }));
      
      console.log(`🎤 Sent ${userName}'s audio chunk:`, audioData.length, 'samples');
    } catch (error) {
      console.error('Error sending audio:', error);
    }
  }, [float32ToPCM16, userName]);

  // Signal turn complete
  const signalTurnComplete = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({
      type: 'turn_complete'
    }));
    
    console.log(`✅ ${userName} finished speaking - signaled to server`);
  }, [userName]);

  // Start listening for audio
  const startListening = useCallback(async () => {
    if (isListening || isAiSpeaking || connectionState !== 'connected') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      streamRef.current = stream;
      
      // Set up audio context
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Use ScriptProcessorNode for real-time audio processing
      processorRef.current = audioContextRef.current.createScriptProcessor(CHUNK_SIZE, 1, 1);
      
      processorRef.current.onaudioprocess = (event) => {
        if (!isListening) return;
        
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Send audio chunk to server
        sendAudioChunk(inputData, false);
      };
      
      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      
      setIsListening(true);
      setConversationActive(true);
      isStreamingRef.current = true;
      
      console.log(`🎤 ${userName} started speaking...`);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        variant: 'destructive',
        title: 'Microphone Access Denied',
        description: 'Please enable microphone permissions to start voice conversation.',
      });
      setIsListening(false);
    }
  }, [isListening, isAiSpeaking, connectionState, sendAudioChunk, toast, userName]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsListening(false);
    isStreamingRef.current = false;
    
    // Signal that user turn is complete
    signalTurnComplete();
    
    console.log(`🎤 ${userName} stopped speaking`);
  }, [signalTurnComplete, userName]);

  // Initialize connection on mount
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopListening();
    };
  }, [connectWebSocket, stopListening]);

  // Button state logic
  const getButtonState = () => {
    if (connectionState === 'connecting') return 'connecting';
    if (connectionState === 'disconnected') return 'disconnected';
    if (isAiSpeaking) return 'speaking';
    if (isListening) return 'listening';
    return 'ready';
  };

  const buttonState = getButtonState();

  const handleAvatarClick = () => {
    switch (buttonState) {
      case 'disconnected':
        connectWebSocket();
        break;
      case 'ready':
        startListening();
        break;
      case 'listening':
        stopListening();
        break;
      default:
        // Do nothing for connecting or speaking states
        break;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-[#2a1a45] via-[#2a1a45] to-[#3f2569]">
      {/* Header */}
      <div className="flex-shrink-0 p-4 text-center border-b border-white/10">
        <h1 className="text-2xl font-bold text-white">L.I.A. Personal English Tutor</h1>
        <p className="text-gray-300">Hello {userName}! Ready for your personalized English practice?</p>
      </div>

      {/* Main Conversation Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Avatar Button */}
        <div className="relative mb-8">
          <button
            onClick={handleAvatarClick}
            disabled={buttonState === 'connecting' || buttonState === 'speaking'}
            className={cn(
              'relative rounded-full w-48 h-48 md:w-64 md:h-64 flex items-center justify-center transition-all duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 overflow-hidden',
              {
                'cursor-pointer hover:opacity-90 hover:scale-105': buttonState === 'ready' || buttonState === 'disconnected' || buttonState === 'listening',
                'cursor-not-allowed opacity-80': buttonState === 'connecting' || buttonState === 'speaking',
                'animate-pulse': buttonState === 'speaking' || buttonState === 'connecting',
                'ring-4 ring-red-400 ring-opacity-75 animate-pulse': buttonState === 'listening',
                'ring-4 ring-blue-400 ring-opacity-75': buttonState === 'speaking'
              }
            )}
            aria-label={
              buttonState === 'disconnected' ? "Connect to L.I.A." :
              buttonState === 'connecting' ? "Loading your personalized conversation..." :
              buttonState === 'ready' ? "Click to speak with L.I.A." :
              buttonState === 'listening' ? "Speaking... (click when finished)" :
              buttonState === 'speaking' ? "L.I.A. is responding..." : "L.I.A."
            }
          >
            <LiaAvatar />
          </button>
        </div>
        
        {/* Status Display */}
        <div className="text-center space-y-4 max-w-md">
          {buttonState === 'connecting' && (
            <div className="flex items-center justify-center space-x-2">
              <Waves className="h-6 w-6 text-blue-400 animate-pulse" />
              <p className="text-lg font-medium text-gray-300">Loading your topics, {userName}...</p>
            </div>
          )}
          
          {buttonState === 'disconnected' && (
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-300">Hi {userName}! Click L.I.A. to start practicing English</p>
              <p className="text-sm text-gray-400">Your conversation will be personalized just for you</p>
            </div>
          )}
          
          {buttonState === 'ready' && (
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-300">Ready to practice, {userName}!</p>
              <p className="text-sm text-gray-400">Click L.I.A. and speak naturally - she's excited to chat with you</p>
            </div>
          )}
          
          {buttonState === 'listening' && (
            <div className="flex items-center justify-center space-x-2">
              <Mic className="h-6 w-6 text-red-400 animate-pulse" />
              <p className="text-lg font-medium text-gray-300">L.I.A. is listening, {userName}... speak naturally!</p>
            </div>
          )}
          
          {buttonState === 'speaking' && (
            <div className="flex items-center justify-center space-x-2">
              <Volume2 className="h-6 w-6 text-blue-400 animate-pulse" />
              <p className="text-lg font-medium text-gray-300">L.I.A. is responding to you...</p>
            </div>
          )}
        </div>

        {/* Latest AI Response */}
        {lastAiResponse && (
          <div className="mt-8 p-4 bg-black/20 rounded-lg max-w-2xl">
            <h3 className="text-white font-semibold mb-3">L.I.A. just said:</h3>
            <div className="p-3 bg-purple-600/20 rounded-lg">
              <p className="text-white italic">"{lastAiResponse}"</p>
            </div>
          </div>
        )}

        {/* Connection Status */}
        {conversationActive && (
          <div className="mt-6 flex items-center space-x-2 text-sm text-green-400">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>Personalized conversation active for {userName}</span>
          </div>
        )}
      </div>

      {/* Instructions Footer */}
      <div className="flex-shrink-0 p-4 border-t border-white/10 text-center">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-400">
          <div className="flex items-center justify-center space-x-2">
            <Play className="h-4 w-4" />
            <span>Click to start speaking</span>
          </div>
          <div className="flex items-center justify-center space-x-2">
            <Pause className="h-4 w-4" />
            <span>Click again when you're done</span>
          </div>
          <div className="flex items-center justify-center space-x-2">
            <Waves className="h-4 w-4" />
            <span>L.I.A. responds naturally</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Personalized English practice for {userName} • L.I.A. understands Portuguese too!
        </div>
      </div>
    </div>
  );
}