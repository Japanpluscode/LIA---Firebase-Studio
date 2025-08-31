import { getUsers } from './actions';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import TopicManager from './topic-manager';

export default async function TopicsAdminPage() {
  const users = await getUsers();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-8 bg-card text-card-foreground">
          <CardHeader>
            <CardTitle>Manage Students and Topics</CardTitle>
            <CardDescription>
              Add students, then select a student to manage their conversation topics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TopicManager users={users} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
