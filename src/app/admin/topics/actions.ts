'use server';

import {db} from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import {revalidatePath} from 'next/cache';

// Placeholder data since Firestore is not connected
let placeholderUsers = [
  {
    id: 'user_1',
    name: 'Alice',
    profile: 'Loves hiking, reading fantasy novels, and trying new vegetarian recipes. Learning Spanish for an upcoming trip to Peru.',
    topics: [
      {id: 'topic_1_1', name: 'Travel', enabled: true},
      {id: 'topic_1_2', name: 'Food', enabled: true},
    ],
  },
  {
    id: 'user_2',
    name: 'Bob',
    profile: 'Works as a software developer. Interested in AI, sci-fi movies, and playing the guitar. Wants to improve his conversational English.',
    topics: [
      {id: 'topic_2_1', name: 'Technology', enabled: true},
      {id: 'topic_2_2', name: 'Work', enabled: false},
    ],
  },
];

export async function getUsers() {
  // Return placeholder data
  return placeholderUsers.map(u => ({id: u.id, name: u.name, profile: u.profile}));
}

export async function getUser(userId: string) {
  const user = placeholderUsers.find(u => u.id === userId);
  return user ? user : null;
}

export async function addUser(name: string, profile: string) {
  if (!name || name.trim() === '') {
    return {error: 'User name cannot be empty.'};
  }
  try {
    const newId = `user_${Date.now()}`;
    const newUser = {
      id: newId,
      name: name.trim(),
      profile: profile.trim(),
      topics: [],
    };
    placeholderUsers.push(newUser);
    revalidatePath('/admin/topics');
    return {success: true, newUser: {id: newUser.id, name: newUser.name, profile: newUser.profile}};
  } catch (error) {
    console.error('Error adding user:', error);
    return {error: 'Failed to add user.'};
  }
}

export async function getTopics(userId: string) {
  // Return placeholder data for a specific user
  const user = placeholderUsers.find(u => u.id === userId);
  return user ? user.topics : [];
}

export async function addTopic(userId: string, topicName: string) {
  if (!userId || !topicName || topicName.trim() === '') {
    return {error: 'User ID and topic name cannot be empty.'};
  }
  try {
    const user = placeholderUsers.find(u => u.id === userId);
    if (user) {
      const newTopic = {
        id: `topic_${userId}_${user.topics.length + 1}`,
        name: topicName.trim(),
        enabled: true,
      };
      user.topics.push(newTopic);
      revalidatePath('/admin/topics');
      return {success: true};
    }
    return {error: 'User not found.'};
  } catch (error) {
    console.error('Error adding topic:', error);
    return {error: 'Failed to add topic.'};
  }
}

export async function deleteTopic(userId: string, topicId: string) {
  try {
    const user = placeholderUsers.find(u => u.id === userId);
    if (user) {
      user.topics = user.topics.filter(topic => topic.id !== topicId);
      revalidatePath('/admin/topics');
      return {success: true};
    }
    return {error: 'User not found.'};
  } catch (error) {
    console.error('Error deleting topic:', error);
    return {error: 'Failed to delete topic.'};
  }
}

export async function toggleTopic(
  userId: string,
  topicId: string,
  currentState: boolean
) {
  try {
    const user = placeholderUsers.find(u => u.id === userId);
    if (user) {
      const topic = user.topics.find(t => t.id === topicId);
      if (topic) {
        topic.enabled = !currentState;
      }
      revalidatePath('/admin/topics');
      return {success: true};
    }
    return {error: 'User not found.'};
  } catch (error) {
    console.error('Error toggling topic:', error);
    return {error: 'Failed to update topic status.'};
  }
}
