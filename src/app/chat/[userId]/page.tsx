'use client';

import { useEffect, useState } from 'react';
import Conversation from '@/components/lia/conversation';
import { getUser, User } from '@/app/admin/topics/actions';
import { Skeleton } from '@/components/ui/skeleton';

export default function ChatPage({ params }: { params: { userId: string } }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.userId) {
      getUser(params.userId)
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
  }, [params.userId]);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2a1a45] via-[#2a1a45] to-[#3f2569] p-4 md:p-8">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-64 w-64 rounded-full" />
          <Skeleton className="h-8 w-64" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
       <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2a1a45] via-[#2a1a45] to-[#3f2569] p-4 md:p-8">
        <p className="text-xl text-destructive-foreground bg-destructive p-4 rounded-md">{error}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2a1a45] via-[#2a1a45] to-[#3f2569] p-4 md:p-8">
      {user && <Conversation userId={user.id} userName={user.name} />}
    </main>
  );
}
