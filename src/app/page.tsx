'use client';

import Conversation from '@/components/lia/conversation';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2a1a45] via-[#2a1a45] to-[#3f2569] p-4 md:p-8">
      <Conversation />
    </main>
  );
}
