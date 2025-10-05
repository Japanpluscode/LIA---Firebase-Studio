'use client';

import { useEffect, useState, use } from 'react';
import Conversation from '@/components/lia/conversation';
import { getUser, User } from '@/app/admin/topics/actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ChatPage({ params }: { params: Promise<{ userId: string }> }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { userId } = use(params);

  useEffect(() => {
    if (userId) {
      getUser(userId)
        .then((userData) => {
          if (userData) {
            setUser(userData);
          } else {
            setError('User not found.');
          }
        })
        .catch(() => setError('Failed to load user data.'))
        .finally(() => setLoading(false));
    }
  }, [userId]);

  const PageWrapper = ({ children }: { children: React.ReactNode }) => (
     <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2a1a45] via-[#2a1a45] to-[#3f2569] p-4 md:p-8">
      {children}
    </main>
  );

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-64 w-64 rounded-full" />
          <Skeleton className="h-8 w-64" />
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
       <PageWrapper>
        <p className="text-xl text-destructive-foreground bg-destructive p-4 rounded-md">{error}</p>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {user ? (
        <Conversation userId={user.id} userName={user.name} />
      ) : (
        <Card>
            <CardHeader>
                <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
                <p>Could not load user data.</p>
            </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
