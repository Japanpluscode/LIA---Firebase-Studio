import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import TopicManager from './topic-manager';

export default async function AdminTopicsPage() {
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Manage Students and Topics</CardTitle>
          <CardDescription>
            Add students, then select a student to manage their conversation topics.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TopicManager />
        </CardContent>
      </Card>
    </div>
  );
}