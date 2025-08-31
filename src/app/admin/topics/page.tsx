import { getTopics, addTopic, deleteTopic, toggleTopic } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default async function TopicsAdminPage() {
  const topics = await getTopics();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-8 bg-card text-card-foreground">
          <CardHeader>
            <CardTitle>Manage Conversation Topics</CardTitle>
            <CardDescription>
              Add, remove, or toggle topics for the user. Only enabled topics
              will be used in conversations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async formData => {
                'use server';
                const topicName = formData.get('topicName') as string;
                await addTopic(topicName);
              }}
              className="flex gap-2 mb-4"
            >
              <Input
                name="topicName"
                placeholder="Enter new topic"
                className="bg-input text-foreground placeholder:text-muted-foreground"
                required
              />
              <Button type="submit">Add Topic</Button>
            </form>
          </CardContent>
        </Card>

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
                  <form
                    action={async () => {
                      'use server';
                      await toggleTopic(topic.id, topic.enabled);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Label
                      htmlFor={`topic-toggle-${topic.id}`}
                      className="text-sm text-muted-foreground"
                    >
                      {topic.enabled ? 'Enabled' : 'Disabled'}
                    </Label>
                    <Switch
                      id={`topic-toggle-${topic.id}`}
                      checked={topic.enabled}
                      onCheckedChange={e => {
                        // The form submission handles the action, but this makes the UI feel instant.
                        // We're effectively submitting the form on change.
                        const form = (e.target as HTMLElement).closest(
                          'form'
                        );
                        form?.requestSubmit();
                      }}
                    />
                  </form>
                  <form
                    action={async () => {
                      'use server';
                      await deleteTopic(topic.id);
                    }}
                  >
                    <Button variant="ghost" size="icon" type="submit">
                      <Trash2 className="h-5 w-5 text-destructive" />
                      <span className="sr-only">Delete topic</span>
                    </Button>
                  </form>
                </div>
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground">
              No topics found. Add one above to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
