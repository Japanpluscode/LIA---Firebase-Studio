import { BookOpen, Utensils, Plane } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

const topics = [
  { name: 'Travel', icon: <Plane className="h-10 w-10 text-primary" />, "data-ai-hint": "travel tourism" },
  { name: 'Food', icon: <Utensils className="h-10 w-10 text-primary" />, "data-ai-hint": "food cooking" },
  { name: 'Hobbies', icon: <BookOpen className="h-10 w-10 text-primary" />, "data-ai-hint": "hobby reading" },
];

type TopicSelectorProps = {
  onTopicSelect: (topic: string) => void;
};

export default function TopicSelector({ onTopicSelect }: TopicSelectorProps) {
  return (
    <div className="w-full max-w-2xl text-center animate-in fade-in duration-500">
      <h1 className="mb-2 font-headline text-4xl font-bold text-primary">
        Welcome to L.I.A.
      </h1>
      <p className="mb-8 text-lg text-muted-foreground">
        Choose a topic to start your conversation.
      </p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {topics.map((topic) => (
          <Card
            key={topic.name}
            onClick={() => onTopicSelect(topic.name)}
            className="cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg hover:border-primary"
            data-ai-hint={topic['data-ai-hint']}
          >
            <CardHeader className="flex flex-col items-center justify-center gap-4 p-8">
              {topic.icon}
              <CardTitle className="font-headline text-xl">{topic.name}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
