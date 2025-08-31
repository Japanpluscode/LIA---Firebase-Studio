'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserByEmail } from './admin/topics/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      const user = await getUserByEmail(email);
      if (user) {
        router.push(`/chat/${user.id}`);
      } else {
        toast({
          variant: 'destructive',
          title: 'Login Failed',
          description: 'No student found with that email address. Please contact your administrator.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'An Error Occurred',
        description: 'Something went wrong. Please try again later.',
      });
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2a1a45] via-[#2a1a45] to-[#3f2569] p-4 md:p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>L.I.A. Login</CardTitle>
          <CardDescription>Enter your email to start your language immersion session.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <Button type="submit" disabled={isLoading || !email}>
              {isLoading ? 'Verifying...' : 'Start Conversation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
