import { getTopics, addTopic } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import TopicList from './topic-list';

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

        <TopicList initialTopics={topics} />
      </div>
    </div>
  );
}
