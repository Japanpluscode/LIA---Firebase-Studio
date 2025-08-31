'use client';

import {useState, useTransition} from 'react';
import {getTopics, addTopic, addUser} from './actions';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import TopicList, {Topic} from './topic-list';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type User = {
  id: string;
  name: string;
  email?: string;
  profile?: string;
};

export default function TopicManager({users}: {users: User[]}) {
  const [currentUsers, setCurrentUsers] = useState<User[]>(users);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [newTopicName, setNewTopicName] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserProfile, setNewUserProfile] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isAddingUser, startAddingUserTransition] = useTransition();

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

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    startAddingUserTransition(async () => {
      const result = await addUser(newUserName, newUserEmail, newUserProfile);
      if (result.success && result.newUser) {
        setCurrentUsers(prev => [...prev, result.newUser!]);
        setNewUserName('');
        setNewUserEmail('');
        setNewUserProfile('');
      }
      // TODO: Handle error case with a toast
    });
  };

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add New Student</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddUser} className="flex flex-col gap-4">
            <div className='grid gap-2'>
               <Label htmlFor="userName">Student Name</Label>
               <Input
                id="userName"
                name="userName"
                placeholder="Enter new student name"
                className="bg-input text-foreground placeholder:text-muted-foreground"
                value={newUserName}
                onChange={e => setNewUserName(e.target.value)}
                required
              />
            </div>
            <div className='grid gap-2'>
               <Label htmlFor="userEmail">Student Email</Label>
               <Input
                id="userEmail"
                name="userEmail"
                type="email"
                placeholder="Enter student's email"
                className="bg-input text-foreground placeholder:text-muted-foreground"
                value={newUserEmail}
                onChange={e => setNewUserEmail(e.target.value)}
                required
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor="userProfile">Student Profile & Preferences</Label>
              <Textarea
                id="userProfile"
                name="userProfile"
                placeholder="e.g., Loves hiking, reading fantasy novels, and trying new vegetarian recipes. Learning Spanish for an upcoming trip to Peru."
                className="bg-input text-foreground placeholder:text-muted-foreground"
                value={newUserProfile}
                onChange={e => setNewUserProfile(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              disabled={isAddingUser || !newUserName.trim() || !newUserEmail.trim()}
              className="w-fit"
            >
              {isAddingUser ? 'Adding...' : 'Add Student'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <label
            htmlFor="user-select"
            className="block text-sm font-medium mb-2"
          >
            Select Student
          </label>
          <Select onValueChange={handleUserChange} value={selectedUserId}>
            <SelectTrigger id="user-select" className="w-full bg-input">
              <SelectValue placeholder="Select a student..." />
            </SelectTrigger>
            <SelectContent>
              {currentUsers.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name} ({user.email})
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
            onChange={e => setNewTopicName(e.target.value)}
            required
            disabled={!selectedUserId}
          />
          <Button
            type="submit"
            disabled={!selectedUserId || !newTopicName.trim()}
          >
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
