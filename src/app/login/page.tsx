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

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  name: z.string().optional(),
});

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');

  useEffect(() => {
    // Since auth is removed, we can probably remove this page or redirect.
    // For now, let's just make it not crash.
    // router.push('/');
  }, [router]);

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

  // Since we removed the auth flow, this page is not directly accessible
  // and is causing a build error. For now, we return a simple loading state.
  return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background">
        <BrainCircuit className="h-16 w-16 animate-pulse text-primary" />
      </div>
    );
}
