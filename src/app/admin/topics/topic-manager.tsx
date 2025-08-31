'use client';

import { useState, useTransition } from 'react';
import { getTopics, addTopic } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TopicList, { Topic } from './topic-list';

type User = {
  id: string;
  name: string;
};

export default function TopicManager({ users }: { users: User[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [newTopicName, setNewTopicName] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    if (userId) {
      startTransition(async () => {
        const userTopics = await getTopics(userId);
        setTopics(userTopics);
      });
    } else {
      setTopics([]);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !newTopicName.trim()) return;

    await addTopic(selectedUserId, newTopicName);
    setNewTopicName('');
    // Refetch topics for the user
    startTransition(async () => {
      const userTopics = await getTopics(selectedUserId);
      setTopics(userTopics);
    });
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label htmlFor="user-select" className="block text-sm font-medium mb-2">
            Select Student
          </label>
          <Select onValueChange={handleUserChange} value={selectedUserId}>
            <SelectTrigger id="user-select" className="w-full bg-input">
              <SelectValue placeholder="Select a student..." />
            </SelectTrigger>
            <SelectContent>
              {users.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {selectedUserId && (
        <form onSubmit={handleAddTopic} className="flex gap-2 mb-4">
            <Input
              name="topicName"
              placeholder="Enter new topic"
              className="bg-input text-foreground placeholder:text-muted-foreground"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              required
              disabled={!selectedUserId}
            />
            <Button type="submit" disabled={!selectedUserId || !newTopicName.trim()}>
              Add Topic
            </Button>
        </form>
      )}


      {isPending ? (
        <p className="text-muted-foreground mt-4">Loading topics...</p>
      ) : (
        <TopicList userId={selectedUserId} initialTopics={topics} />
      )}
    </div>
  );
}
