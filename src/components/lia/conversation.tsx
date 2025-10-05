'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Volume2, Loader, ServerCrash, User, StopCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { getTopics } from '@/app/admin/topics/actions';

const LiaAvatar = () => (
  <svg
    className="absolute inset-0 w-full h-full"
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="L.I.A. Avatar"
  >
    <defs>
      <clipPath id="circleClip">
        <circle cx="50" cy="50" r="50" />
      </clipPath>
    </defs>
    <circle cx="50" cy="50" r="50" fill="currentColor" className="text-primary/10" />
    <image
      href="https://firebasestorage.googleapis.com/v0/b/lia-language-app.appspot.com/o/LIA.png?alt=media&token=87a71871-26b2-4b36-812b-109436413280"
      x="0" y="0" width="100" height="100"
      preserveAspectRatio="xMidYMid slice"
      clipPath="url(#circleClip)"
    />
    <circle cx="50" cy="50" r="49.5" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/50" />
  </svg>
);


type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type ConversationState = 'idle' | 'listening' | 'processing' | 'speaking';

interface ConversationProps {
  userId: string;
  userName: string;
}

export default function Conversation({ userId, userName }: ConversationProps) {
    const [connStatus, setConnStatus] = useState<ConnectionStatus>('disconnected');
    const [convoState, setConvoState] = useState<ConversationState>('idle');
    const [userTopics, setUserTopics] = useState<string[]>([]);
    
    const socketRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
    const audioQueueRef = useRef<ArrayBuffer[]>([]);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        getTopics(userId)
            .then(topics => {
                const enabledTopics = topics.filter(t => t.enabled).map(t => t.name);
                setUserTopics(enabledTopics.length > 0 ? enabledTopics : ['General Conversation']);
            })
            .catch(err => {
                console.error("Failed to fetch topics", err);
                toast({ title: 'Could not load topics', variant: 'destructive' });
                setUserTopics(['General Conversation']);
            });
    }, [userId, toast]);
    
    const playNextAudioChunk = useCallback(() => {
        if (audioQueueRef.current.length === 0) {
            setConvoState('idle');
            return;
        }

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const audioData = audioQueueRef.current.shift()!;
        setConvoState('speaking');

        audioContextRef.current.decodeAudioData(audioData)
            .then(buffer => {
                const source = audioContextRef.current!.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current!.destination);
                source.onended = () => {
                    if (audioQueueRef.current.length > 0) {
                        playNextAudioChunk();
                    } else {
                       // This is handled by the 'turn_complete' message from the server now
                    }
                };
                source.start();
                sourceNodeRef.current = source;
            })
            .catch(e => {
                console.error("Error decoding audio data", e);
                setConvoState('idle');
            });
    }, []);

    const connectWebSocket = useCallback(() => {
        if (socketRef.current) return;
        if (userTopics.length === 0) return; // Don't connect until topics are loaded

        setConnStatus('connecting');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/live`;
        
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;
        
        socket.onopen = () => {
            console.log("Client WebSocket connected");
            const systemInstruction = `You are L.I.A., a friendly and encouraging English teacher. The student's name is ${userName}. Your goal is to have a natural, flowing conversation. Make comments, share your own (fictional) thoughts, and react to what the student says. You MUST ONLY discuss these topics: ${userTopics.join(', ')}. If the user tries to talk about something else, politely guide them back to one of the approved topics. Keep your responses concise.`;
            socket.send(JSON.stringify({ type: 'setup', systemInstruction }));
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'ready') {
                setConnStatus('connected');
                setConvoState('idle');
                toast({ title: "L.I.A. is ready!", description: "Click the avatar and start speaking." });
            } else if (message.type === 'audio' && message.data) {
                const audioData = atob(message.data);
                const audioBytes = new Uint8Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    audioBytes[i] = audioData.charCodeAt(i);
                }
                audioQueueRef.current.push(audioBytes.buffer);
                if (convoState !== 'speaking') {
                    playNextAudioChunk();
                }
            } else if (message.type === 'turn_complete') {
                // Once AI is done talking, we go back to idle.
                setConvoState('idle');
            } else if (message.type === 'error') {
                console.error("Server error:", message.message);
                toast({ title: "Connection Error", description: message.message, variant: 'destructive' });
                setConnStatus('error');
            }
        };

        socket.onerror = (err) => {
            console.error("WebSocket error:", err);
            setConnStatus('error');
            toast({ title: "Connection Failed", description: "Could not connect to the conversation server.", variant: 'destructive' });
        };

        socket.onclose = () => {
            console.log("WebSocket closed");
            setConnStatus('disconnected');
            setConvoState('idle');
            socketRef.current = null;
        };
    }, [userName, userTopics, convoState, playNextAudioChunk, toast]);

    const startListening = useCallback(async () => {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            toast({ title: 'Not connected', description: 'Please wait for the connection to establish.', variant: 'destructive' });
            return;
        }

        try {
            if (!audioContextRef.current) {
                 audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                 await audioContextRef.current.audioWorklet.addModule('/resampler.js');
            }
            if (audioContextRef.current.state === 'suspended') {
                await audioContextRef.current.resume();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const source = audioContextRef.current.createMediaStreamSource(stream);
            mediaStreamSourceRef.current = source;
            
            const audioWorkletNode = new AudioWorkletNode(audioContextRef.current, 'audio-resampler');
            audioWorkletNodeRef.current = audioWorkletNode;

            audioWorkletNode.port.onmessage = (event) => {
                const pcm16Data = event.data;
                const base64Data = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm16Data.buffer) as any));
                if (socketRef.current?.readyState === WebSocket.OPEN) {
                    socketRef.current.send(JSON.stringify({ type: 'audio', data: base64Data }));
                }
            };
            
            source.connect(audioWorkletNode);
            // We don't connect to destination to avoid feedback loop
            
            setConvoState('listening');
            
        } catch (error) {
            console.error('Microphone access denied:', error);
            toast({ title: 'Microphone Error', description: 'Could not access microphone. Please check permissions.', variant: 'destructive' });
        }
    }, [toast]);

    const stopListening = useCallback(() => {
        setConvoState('processing');

        if(socketRef.current?.readyState === WebSocket.OPEN){
             socketRef.current.send(JSON.stringify({ type: 'turn_complete' }));
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }
    }, []);

    const handleClick = () => {
        if (connStatus === 'disconnected' || connStatus === 'error') {
            connectWebSocket();
            return;
        }
        
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
        
        if (convoState === 'listening') {
            stopListening();
        } else if (convoState === 'idle') {
            startListening();
        } else if (convoState === 'speaking') {
            // Stop AI speech playback
            if (sourceNodeRef.current) {
                sourceNodeRef.current.stop();
                sourceNodeRef.current = null;
            }
            audioQueueRef.current = [];
            setConvoState('idle');
        }
    };
    
    // Auto-connect on mount when topics are loaded
    useEffect(() => {
        if (userTopics.length > 0 && connStatus === 'disconnected') {
            connectWebSocket();
        }

        // Cleanup on unmount
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, [userTopics, connStatus, connectWebSocket]);

    const getStatusInfo = () => {
        switch (connStatus) {
            case 'connecting': return { text: 'Connecting to L.I.A....', Icon: Loader, animate: true, isInteractive: false };
            case 'error': return { text: 'Connection failed. Click to retry.', Icon: ServerCrash, animate: false, isInteractive: true };
            case 'disconnected': return { text: 'Click to connect', Icon: User, animate: false, isInteractive: true };
            case 'connected':
                switch (convoState) {
                    case 'listening': return { text: 'Listening... (Click to stop)', Icon: Mic, animate: true, isInteractive: true };
                    case 'processing': return { text: 'L.I.A. is thinking...', Icon: Loader, animate: true, isInteractive: false };
                    case 'speaking': return { text: 'L.I.A. is speaking...', Icon: Volume2, animate: true, isInteractive: true };
                    case 'idle': return { text: 'Click the avatar to speak', Icon: Mic, animate: false, isInteractive: true };
                }
        }
    };
    const { text, Icon, animate, isInteractive } = getStatusInfo();
    
    return (
        <div className="flex flex-col items-center justify-center text-center w-full max-w-lg mx-auto">
            <div className="relative w-48 h-48 md:w-64 md:h-64 mb-8">
                <button
                    onClick={handleClick}
                    disabled={!isInteractive}
                    className={cn(
                        'relative rounded-full overflow-hidden w-full h-full flex items-center justify-center transition-all duration-300 shadow-2xl text-primary',
                        {
                            'ring-4 ring-current': animate,
                            'hover:scale-105 active:scale-100': isInteractive,
                            'opacity-75 cursor-not-allowed': !isInteractive,
                            'animate-pulse': animate && Icon !== Loader,
                        }
                    )}
                    aria-label={text}
                >
                    <LiaAvatar />
                </button>
            </div>
    
            <div className="h-16 flex flex-col items-center justify-center">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                   <Icon className={cn('w-7 h-7', {'animate-spin': Icon === Loader})} />
                   <span>{text}</span>
                </h2>
                {userTopics.length > 0 && connStatus === 'connected' && (
                    <p className="text-sm text-white/60 mt-2">
                        Today's topics: {userTopics.join(', ')}
                    </p>
                )}
            </div>
        </div>
    );
}
