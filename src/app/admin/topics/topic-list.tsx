'use client';

import { useState } from 'react';
import { deleteTopic, toggleTopic } from './actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type Topic = {
  id: string;
  name: string;
  enabled: boolean;
};

export default function TopicList({ initialTopics }: { initialTopics: Topic[] }) {
  const [topics, setTopics] = useState(initialTopics);

  const handleToggle = async (topic: Topic) => {
    // Optimistically update the UI
    setTopics(currentTopics =>
      currentTopics.map(t =>
        t.id === topic.id ? { ...t, enabled: !t.enabled } : t
      )
    );
    // Then call the server action
    await toggleTopic(topic.id, topic.enabled);
  };

  const handleDelete = async (topicId: string) => {
     // Optimistically update the UI
    setTopics(currentTopics => currentTopics.filter(t => t.id !== topicId));
     // Then call the server action
    await deleteTopic(topicId);
  }

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-bold">Current Topics</h2>
      {topics.length > 0 ? (
        topics.map(topic => (
          <Card
            key={topic.id}
            className="flex items-center justify-between p-4 bg-card text-card-foreground"
          >
            <span className="font-medium">{topic.name}</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`topic-toggle-${topic.id}`}
                  className="text-sm text-muted-foreground"
                >
                  {topic.enabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id={`topic-toggle-${topic.id}`}
                  checked={topic.enabled}
                  onCheckedChange={() => handleToggle(topic)}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(topic.id)}>
                <Trash2 className="h-5 w-5 text-destructive" />
                <span className="sr-only">Delete topic</span>
              </Button>
            </div>
          </Card>
        ))
      ) : (
        <p className="text-muted-foreground">
          No topics found. Add one above to get started.
        </p>
      )}
    </div>
  );
}
