'use client';

import { useState, useEffect } from 'react';
import { deleteTopic, toggleTopic } from './actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export type Topic = {
  id: string;
  name: string;
  enabled: boolean;
};

export default function TopicList({
  userId,
  initialTopics,
}: {
  userId: string;
  initialTopics: Topic[];
}) {
  const [topics, setTopics] = useState(initialTopics);

  useEffect(() => {
    setTopics(initialTopics);
  }, [initialTopics]);


  const handleToggle = async (topic: Topic) => {
    setTopics(currentTopics =>
      currentTopics.map(t =>
        t.id === topic.id ? { ...t, enabled: !t.enabled } : t
      )
    );
    await toggleTopic(userId, topic.id, topic.enabled);
  };

  const handleDelete = async (topicId: string) => {
    setTopics(currentTopics => currentTopics.filter(t => t.id !== topicId));
    await deleteTopic(userId, topicId);
  };

  if (!userId) {
     return <p className="text-muted-foreground mt-4">Please select a student to see their topics.</p>
  }

  return (
    <div className="grid gap-4 mt-6">
      <h2 className="text-2xl font-bold">Topics for Selected Student</h2>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(topic.id)}
              >
                <Trash2 className="h-5 w-5 text-destructive" />
                <span className="sr-only">Delete topic</span>
              </Button>
            </div>
          </Card>
        ))
      ) : (
        <p className="text-muted-foreground">
          No topics found for this student. Add one above to get started.
        </p>
      )}
    </div>
  );
}
