'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrainCircuit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  name: z.string().optional(),
});

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  const handleSignIn = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      router.push('/');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Sign In Failed',
        description: 'Please check your email and password.',
      });
      setLoading(false);
    }
  };

  const handleSignUp = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    if (!values.name || values.name.trim() === '') {
      form.setError('name', { type: 'manual', message: 'Name is required for sign up.' });
      setLoading(false);
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      await updateProfile(userCredential.user, { displayName: values.name });
      router.push('/');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Sign Up Failed',
        description: 'This email may already be in use.',
      });
      setLoading(false);
    }
  };

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <BrainCircuit className="h-16 w-16 animate-pulse text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center justify-center mb-6 text-center">
        <div className="mb-4">
          <Image
            src="https://i.imgur.com/wP42LzL.png"
            alt="L.I.A. Avatar"
            width={100}
            height={100}
            className="rounded-full"
            priority
          />
        </div>
        <h1 className="text-3xl font-bold font-headline text-primary">L.I.A.</h1>
        <p className="text-muted-foreground">Language Immersion AI</p>
      </div>
      <Tabs defaultValue="signin" className="w-full max-w-sm" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Sign In</TabsTrigger>
          <TabsTrigger value="signup">Sign Up</TabsTrigger>
        </TabsList>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(activeTab === 'signin' ? handleSignIn : handleSignUp)}>
            <TabsContent value="signin">
              <Card>
                <CardHeader>
                  <CardTitle>Sign In</CardTitle>
                  <CardDescription>Enter your credentials to access your account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com" {...field} autoComplete="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} autoComplete="current-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
            <TabsContent value="signup">
              <Card>
                <CardHeader>
                  <CardTitle>Sign Up</CardTitle>
                  <CardDescription>Create a new account to start learning.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your Name" {...field} autoComplete="name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com" {...field} autoComplete="email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} autoComplete="new-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Sign Up'}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </form>
        </Form>
      </Tabs>
    </main>
  );
}
