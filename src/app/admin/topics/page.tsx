import { getTopics, addTopic, deleteTopic } from './actions';
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

export default async function TopicsAdminPage() {
  const topics = await getTopics();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-8 bg-card text-card-foreground">
          <CardHeader>
            <CardTitle>Manage Conversation Topics</CardTitle>
            <CardDescription>
              Add or remove topics that L.I.A. can use to start conversations.
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
              </Card>
            ))
          ) : (
            <p className="text-muted-foreground">No topics found. Add one above to get started.</p>
          )}
        </div>
      </div>
    </div>
  );
}
