'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Trash2, Edit2, Save, X, Clock, MessageSquare } from 'lucide-react';
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
  const [newStudentDuration, setNewStudentDuration] = useState(5);
  const [newStudentInstructions, setNewStudentInstructions] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserProfile, setEditUserProfile] = useState('');
  const [editUserDuration, setEditUserDuration] = useState(5);
  const [editUserInstructions, setEditUserInstructions] = useState('');
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
        setEditUserDuration(user.conversationDuration || 5);
        setEditUserInstructions(user.conversationInstructions || '');
        setIsEditingUser(false);
      }
    }
  }, [selectedUserId, users]);

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

    if (newStudentDuration < 1 || newStudentDuration > 30) {
      toast({
        title: 'Error',
        description: 'Duration must be between 1 and 30 minutes',
        variant: 'destructive'
      });
      return;
    }

    try {
      await addUser(
        newStudentName, 
        newStudentEmail, 
        newStudentProfile,
        newStudentDuration,
        newStudentInstructions
      );
      toast({
        title: 'Success',
        description: 'Student added successfully'
      });
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentProfile('');
      setNewStudentDuration(5);
      setNewStudentInstructions('');
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

    if (editUserDuration < 1 || editUserDuration > 30) {
      toast({
        title: 'Error',
        description: 'Duration must be between 1 and 30 minutes',
        variant: 'destructive'
      });
      return;
    }

    try {
      await updateUser(
        selectedUserId, 
        editUserName, 
        editUserEmail, 
        editUserProfile,
        editUserDuration,
        editUserInstructions
      );
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
      setEditUserDuration(user.conversationDuration || 5);
      setEditUserInstructions(user.conversationInstructions || '');
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

  const activeTopics = topics.filter(t => t.enabled);

  return (
    <div className="space-y-6">
      {/* Add New Student */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Add New Student</h3>
        <div className="grid gap-4">
          <div>
            <label className="text-sm font-medium">Student Name *</label>
            <Input
              placeholder="Enter new student name"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Student Email *</label>
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

          {/* NEW: Conversation Duration */}
          <div>
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Conversation Duration (minutes) *
            </label>
            <Input
              type="number"
              min="1"
              max="30"
              value={newStudentDuration}
              onChange={(e) => setNewStudentDuration(parseInt(e.target.value) || 5)}
              placeholder="5"
            />
            <p className="text-xs text-muted-foreground mt-1">
              How long should conversations last? (1-30 minutes, default: 5)
            </p>
          </div>

          {/* NEW: Conversation Instructions */}
          <div>
            <label className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Special Instructions for L.I.A.
            </label>
            <Textarea
              placeholder="Leave empty for default conversational style, or enter custom instructions..."
              value={newStudentInstructions}
              onChange={(e) => setNewStudentInstructions(e.target.value)}
              rows={4}
            />
            <div className="mt-2 p-3 bg-muted/50 rounded-md space-y-1">
              <p className="text-xs font-medium">💡 Example Instructions:</p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>• "Only ask questions. Wait for the student to answer fully."</li>
                <li>• "The student will practice asking YOU questions. Answer naturally."</li>
                <li>• "Fast-paced drill. Quick questions, quick answers."</li>
                <li>• "Focus on past tense. Ask about weekend activities."</li>
                <li>• "Tell a story and ask comprehension questions."</li>
                <li>• "Use these 5 words in conversation: journey, adventure, explore, culture, destination"</li>
              </ul>
              <p className="text-xs text-muted-foreground italic mt-2">
                Leave empty for balanced, natural conversation style.
              </p>
            </div>
          </div>

          <Button onClick={handleAddStudent}>Add Student</Button>
        </div>
      </div>

      {/* Select Student */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-semibold">Select Student</h3>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a student..." />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name} ({user.email}) - {user.conversationDuration}min
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Edit Student Profile */}
      {selectedUserId && (
        <div className="space-y-4 border-t pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Student Settings</h3>
            {!isEditingUser ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditingUser(true)}
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit Settings
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
                  Save Changes
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

            {/* Duration Field */}
            <div>
              <label className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Conversation Duration (minutes)
              </label>
              <Input
                type="number"
                min="1"
                max="30"
                value={editUserDuration}
                onChange={(e) => setEditUserDuration(parseInt(e.target.value) || 5)}
                disabled={!isEditingUser}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current: {editUserDuration} minutes
              </p>
            </div>

            {/* Instructions Field */}
            <div>
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Special Instructions for L.I.A.
              </label>
              <Textarea
                value={editUserInstructions}
                onChange={(e) => setEditUserInstructions(e.target.value)}
                disabled={!isEditingUser}
                rows={4}
                placeholder="Leave empty for default conversational style..."
              />
              {!isEditingUser && !editUserInstructions && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  Using default conversation style (no special instructions)
                </p>
              )}
              {!isEditingUser && editUserInstructions && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                  <p className="font-medium text-blue-900">Active Instructions:</p>
                  <p className="text-blue-700 mt-1">{editUserInstructions}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manage Topics */}
      {selectedUserId && (
        <div className="space-y-4 border-t pt-6">
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
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-medium">Current Topics</h4>
              <span className="text-xs text-muted-foreground">
                {activeTopics.length} enabled, {topics.length - activeTopics.length} disabled
              </span>
            </div>
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
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          Active
                        </span>
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

          {/* Active Topics Display */}
          {activeTopics.length > 0 && (
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="text-sm font-semibold text-green-700">
                Active Topics for AI Conversations
              </h4>
              <div className="flex flex-wrap gap-2">
                {activeTopics.map((topic) => (
                  <span
                    key={topic.id}
                    className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full"
                  >
                    {topic.name}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                L.I.A. will only discuss these topics with this student. The AI will politely redirect if the student tries to discuss other subjects.
              </p>
            </div>
          )}
        </div>
      )}

      {!selectedUserId && (
        <div className="text-center py-8 text-muted-foreground border-t">
          Select a student above to manage their settings and topics.
        </div>
      )}
    </div>
  );
}