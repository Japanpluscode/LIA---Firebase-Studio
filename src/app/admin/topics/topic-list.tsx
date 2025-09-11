// src/app/admin/topics/topic-list.tsx - Updated Topic List Component
'use client';

import {useState, useTransition} from 'react';
import {deleteTopic, toggleTopic} from './actions';
import {Button} from '@/components/ui/button';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Switch} from '@/components/ui/switch';
import {Trash2} from 'lucide-react';

export type Topic = {
  id: string;
  name: string;
  enabled: boolean;
};

interface TopicListProps {
  userId: string;
  initialTopics: Topic[];
}

export default function TopicList({userId, initialTopics}: TopicListProps) {
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [isPending, startTransition] = useTransition();

  const handleToggleTopic = async (topicId: string, currentState: boolean) => {
    // Optimistically update the UI
    setTopics(prevTopics =>
      prevTopics.map(topic =>
        topic.id === topicId ? {...topic, enabled: !currentState} : topic
      )
    );

    startTransition(async () => {
      const result = await toggleTopic(userId, topicId, currentState);
      if (!result.success) {
        // Revert on error
        setTopics(prevTopics =>
          prevTopics.map(topic =>
            topic.id === topicId ? {...topic, enabled: currentState} : topic
          )
        );
      }
    });
  };

  const handleDeleteTopic = async (topicId: string) => {
    // Optimistically remove from UI
    setTopics(prevTopics => prevTopics.filter(topic => topic.id !== topicId));

    startTransition(async () => {
      const result = await deleteTopic(userId, topicId);
      if (!result.success) {
        // Revert on error - you'd want to refetch topics here in a real app
        window.location.reload();
      }
    });
  };

  if (!userId) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">
            Select a student to manage their topics.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (topics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Topics Yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Add some conversation topics for this student above.
          </p>
        </CardContent>
      </Card>
    );
  }

  const enabledTopics = topics.filter(topic => topic.enabled);
  const disabledTopics = topics.filter(topic => !topic.enabled);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Current Topics</span>
            <span className="text-sm font-normal text-muted-foreground">
              {enabledTopics.length} enabled, {disabledTopics.length} disabled
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topics.map(topic => (
            <div
              key={topic.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Switch
                  checked={topic.enabled}
                  onCheckedChange={() => handleToggleTopic(topic.id, topic.enabled)}
                  disabled={isPending}
                />
                <span
                  className={`font-medium ${
                    topic.enabled ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {topic.name}
                </span>
                {topic.enabled && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteTopic(topic.id)}
                disabled={isPending}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {enabledTopics.length > 0 && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-green-800">
              Active Topics for AI Conversations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {enabledTopics.map(topic => (
                <span
                  key={topic.id}
                  className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full"
                >
                  {topic.name}
                </span>
              ))}
            </div>
            <p className="text-sm text-green-700 mt-3">
              L.I.A. will only discuss these topics with this student. The AI will politely redirect if the student tries to discuss other subjects.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}