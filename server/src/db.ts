import { Database } from "bun:sqlite";

const db = new Database("ai-gym-tracker.db", { create: true });

// Enable WAL mode for better concurrent reads
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    goal TEXT NOT NULL,
    fitness_level TEXT NOT NULL,
    days_per_week INTEGER NOT NULL,
    dietary_pref TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    workout_content TEXT,
    diet_content TEXT,
    quiz TEXT,
    is_completed INTEGER DEFAULT 0,
    quiz_score REAL,
    sort_order INTEGER NOT NULL
  );
`);

// --- Type Definitions ---

export interface PlanRow {
  id: string;
  name: string;
  goal: string;
  fitness_level: string;
  days_per_week: number;
  dietary_pref: string;
  description: string;
  created_at: number;
}

export interface SessionRow {
  id: string;
  plan_id: string;
  title: string;
  description: string;
  workout_content: string | null;
  diet_content: string | null;
  quiz: string | null;
  is_completed: number;
  quiz_score: number | null;
  sort_order: number;
}

// --- Query Helpers ---

export function getAllPlans(): PlanRow[] {
  return db.query("SELECT * FROM plans ORDER BY created_at DESC").all() as PlanRow[];
}

export function getPlanById(id: string): PlanRow | null {
  return db.query("SELECT * FROM plans WHERE id = ?").get(id) as PlanRow | null;
}

export function getSessionsByPlanId(planId: string): SessionRow[] {
  return db
    .query("SELECT * FROM sessions WHERE plan_id = ? ORDER BY sort_order")
    .all(planId) as SessionRow[];
}

export function insertPlan(plan: PlanRow): void {
  db.query(
    "INSERT INTO plans (id, name, goal, fitness_level, days_per_week, dietary_pref, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    plan.id,
    plan.name,
    plan.goal,
    plan.fitness_level,
    plan.days_per_week,
    plan.dietary_pref,
    plan.description,
    plan.created_at
  );
}

export function insertSession(
  session: Omit<SessionRow, "is_completed" | "quiz_score" | "workout_content" | "diet_content" | "quiz">
): void {
  db.query(
    "INSERT INTO sessions (id, plan_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)"
  ).run(session.id, session.plan_id, session.title, session.description, session.sort_order);
}

export function updateSessionContent(
  id: string,
  workoutContent: string,
  dietContent: string,
  quiz: string
): void {
  db.query(
    "UPDATE sessions SET workout_content = ?, diet_content = ?, quiz = ? WHERE id = ?"
  ).run(workoutContent, dietContent, quiz, id);
}

export function updateSessionQuizScore(id: string, score: number, isCompleted: boolean): void {
  db.query("UPDATE sessions SET quiz_score = ?, is_completed = ? WHERE id = ?").run(
    score,
    isCompleted ? 1 : 0,
    id
  );
}

export function deletePlan(id: string): void {
  db.query("DELETE FROM plans WHERE id = ?").run(id);
}

export default db;
