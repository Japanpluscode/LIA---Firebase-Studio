'use client';

import { useState } from 'react';
import Conversation from '@/components/lia/conversation';

export default function Home() {
  // The topic will be chosen by the AI, so we can start the conversation directly.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4 md:p-8">
      <Conversation />
    </main>
  );
}
