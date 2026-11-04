import { MODE } from '../supabase.js';
import { demoApi } from './demoApi.js';
import { supabaseApi } from './supabaseApi.js';

// The pages call `api.*` and never need to know which one they're talking to.
export const api = MODE === 'live' ? supabaseApi : demoApi;
