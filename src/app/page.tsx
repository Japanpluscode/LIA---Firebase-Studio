'use client';

import { useState } from 'react';

import TopicSelector from '@/components/lia/topic-selector';
import Conversation from '@/components/lia/conversation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Book } from 'lucide-react';

export default function Home() {
  const [topic, setTopic] = useState<string | null>(null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 md:p-8">
      <div className="absolute top-4 right-4">
        <Button asChild variant="ghost">
          <Link href="/feedback">
            <Book className="mr-2 h-4 w-4" />
            Feedback
          </Link>
        </Button>
      </div>
      {topic ? (
        <Conversation topic={topic} onTopicChange={() => setTopic(null)} />
      ) : (
        <TopicSelector onTopicSelect={setTopic} />
      )}
    </main>
  );
}
