'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/dynamic-question-selection.ts';
import '@/ai/flows/grammar-correction.ts';
import '@/ai/flows/generate-feedback.ts';
