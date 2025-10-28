'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Edit2, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getUsers, addUser, updateUser, getTopics, addTopic, deleteTopic, toggleTopic } from './actions';
import type { User, Topic } from './actions';

export default function TopicManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentProfile, setNewStudentProfile] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserProfile, setEditUserProfile] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadTopics(selectedUserId);
      const user = users.find(u => u.id === selectedUserId);
      if (user) {
        setEditUserName(user.name);
        setEditUserEmail(user.email);
        setEditUserProfile(user.profile);
      }
    }
  }, [selectedUserId]);

  const loadUsers = async () => {
    const fetchedUsers = await getUsers();
    setUsers(fetchedUsers);
  };

  const loadTopics = async (userId: string) => {
    const fetchedTopics = await getTopics(userId);
    setTopics(fetchedTopics);
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !newStudentEmail.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter both name and email',
        variant: 'destructive'
      });
      return;
    }

    try {
      await addUser(newStudentName, newStudentEmail, newStudentProfile);
      toast({
        title: 'Success',
        description: 'Student added successfully'
      });
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentProfile('');
      await loadUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add student',
        variant: 'destructive'
      });
    }
  };

  const handleUpdateStudent = async () => {
    if (!selectedUserId || !editUserName.trim() || !editUserEmail.trim()) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      await updateUser(selectedUserId, editUserName, editUserEmail, editUserProfile);
      toast({
        title: 'Success',
        description: 'Student profile updated successfully'
      });
      setIsEditingUser(false);
      await loadUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update student',
        variant: 'destructive'
      });
    }
  };

  const handleCancelEdit = () => {
    const user = users.find(u => u.id === selectedUserId);
    if (user) {
      setEditUserName(user.name);
      setEditUserEmail(user.email);
      setEditUserProfile(user.profile);
    }
    setIsEditingUser(false);
  };

  const handleAddTopic = async () => {
    if (!selectedUserId) {
      toast({
        title: 'Error',
        description: 'Please select a student first',
        variant: 'destructive'
      });
      return;
    }

    if (!newTopicName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a topic name',
        variant: 'destructive'
      });
      return;
    }

    try {
      await addTopic(selectedUserId, newTopicName);
      toast({
        title: 'Success',
        description: 'Topic added successfully'
      });
      setNewTopicName('');
      await loadTopics(selectedUserId);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add topic',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!selectedUserId) return;

    try {
      await deleteTopic(selectedUserId, topicId);
      toast({
        title: 'Success',
        description: 'Topic deleted successfully'
      });
      await loadTopics(selectedUserId);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete topic',
        variant: 'destructive'
      });
    }
  };

  const handleToggleTopic = async (topicId: string, enabled: boolean) => {
    if (!selectedUserId) return;

    try {
      await toggleTopic(selectedUserId, topicId, enabled);
      await loadTopics(selectedUserId);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle topic',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Manage Students and Topics</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add students, then select a student to manage their conversation topics.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add New Student */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Add New Student</h3>
            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium">Student Name</label>
                <Input
                  placeholder="Enter new student name"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Student Email</label>
                <Input
                  type="email"
                  placeholder="Enter student's email"
                  value={newStudentEmail}
                  onChange={(e) => setNewStudentEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Student Profile & Preferences</label>
                <Textarea
                  placeholder="e.g., Loves hiking, reading fantasy novels, and trying new vegetarian recipes. Learning Spanish for an upcoming trip to Peru."
                  value={newStudentProfile}
                  onChange={(e) => setNewStudentProfile(e.target.value)}
                  rows={3}
                />
              </div>
              <Button onClick={handleAddStudent}>Add Student</Button>
            </div>
          </div>

          {/* Select Student */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Select Student</h3>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a student..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Edit Student Profile */}
          {selectedUserId && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Student Profile</h3>
                {!isEditingUser ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingUser(true)}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleUpdateStudent}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    disabled={!isEditingUser}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    value={editUserEmail}
                    onChange={(e) => setEditUserEmail(e.target.value)}
                    disabled={!isEditingUser}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Profile & Preferences</label>
                  <Textarea
                    value={editUserProfile}
                    onChange={(e) => setEditUserProfile(e.target.value)}
                    disabled={!isEditingUser}
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Manage Topics */}
          {selectedUserId && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold">Manage Topics</h3>
              
              {/* Add Topic */}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter new topic"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTopic()}
                />
                <Button onClick={handleAddTopic}>Add Topic</Button>
              </div>

              {/* Topics List */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Current Topics</h4>
                {topics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No topics yet. Add a topic above to get started.
                  </p>
                ) : (
                  topics.map((topic) => (
                    <Card key={topic.id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3 flex-1">
                          <Switch
                            checked={topic.enabled}
                            onCheckedChange={(checked) => handleToggleTopic(topic.id, checked)}
                          />
                          <span className={topic.enabled ? '' : 'text-muted-foreground line-through'}>
                            {topic.name}
                          </span>
                          {topic.enabled && (
                            <span className="text-xs text-green-600 font-medium">Enabled</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTopic(topic.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}

          {!selectedUserId && (
            <div className="text-center py-8 text-muted-foreground">
              Select a student to manage their topics.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}