'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import TopicSelector from '@/components/lia/topic-selector';
import Conversation from '@/components/lia/conversation';
import { Skeleton } from '@/components/ui/skeleton';
import { BrainCircuit } from 'lucide-react';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [topic, setTopic] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <BrainCircuit className="h-16 w-16 animate-pulse text-primary" />
        <p className="text-muted-foreground">Loading your learning experience...</p>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 md:p-8">
      {topic ? (
        <Conversation topic={topic} onTopicChange={() => setTopic(null)} />
      ) : (
        <TopicSelector onTopicSelect={setTopic} />
      )}
    </main>
  );
}
