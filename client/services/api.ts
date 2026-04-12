import { Plan, Session } from '../types';

const BASE_URL = '/api';

export async function getPlans(): Promise<Plan[]> {
  const res = await fetch(`${BASE_URL}/plans`);
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
}

export async function getPlan(id: string): Promise<Plan> {
  const res = await fetch(`${BASE_URL}/plans/${id}`);
  if (!res.ok) throw new Error('Failed to fetch plan');
  return res.json();
}

export async function generatePlan(params: {
  goal: string;
  fitnessLevel: string;
  daysPerWeek: number;
  dietaryPref: string;
}): Promise<Plan> {
  const res = await fetch(`${BASE_URL}/generate-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error('Failed to generate plan');
  return res.json();
}

export async function* streamSessionContent(params: {
  planId: string;
  sessionId: string;
  planName: string;
  goal: string;
  fitnessLevel: string;
  dietaryPref: string;
  sessionTitle: string;
  sessionDescription: string;
}): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/stream-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok || !res.body) throw new Error('Failed to stream session');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export async function updateQuizScore(
  sessionId: string,
  score: number,
  isCompleted: boolean
): Promise<void> {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/quiz-score`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, isCompleted }),
  });
  if (!res.ok) throw new Error('Failed to update quiz score');
}

export async function deletePlan(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/plans/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete plan');
}
