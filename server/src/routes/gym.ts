import { Router, type Request, type Response } from "express";
import { generateObject, streamText } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
  insertPlan,
  insertSession,
  getAllPlans,
  getPlanById,
  getSessionsByPlanId,
  updateSessionContent,
  updateSessionQuizScore,
  deletePlan,
  type PlanRow,
  type SessionRow,
} from "../db.js";

const router = Router();

// --- Helpers ---

function mapSessionRow(row: SessionRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    workoutContent: row.workout_content ?? undefined,
    dietContent: row.diet_content ?? undefined,
    quiz: row.quiz ? JSON.parse(row.quiz) : undefined,
    isCompleted: row.is_completed === 1,
    quizScore: row.quiz_score ?? undefined,
  };
}

function mapPlanRow(plan: PlanRow, sessions: SessionRow[]) {
  return {
    id: plan.id,
    name: plan.name,
    goal: plan.goal,
    fitnessLevel: plan.fitness_level,
    daysPerWeek: plan.days_per_week,
    dietaryPref: plan.dietary_pref,
    description: plan.description,
    sessions: sessions.map(mapSessionRow),
    createdAt: plan.created_at,
  };
}

// --- Routes ---

// GET /api/plans
router.get("/plans", (_req: Request, res: Response) => {
  const plans = getAllPlans();
  const result = plans.map((p) => {
    const sessions = getSessionsByPlanId(p.id);
    return mapPlanRow(p, sessions);
  });
  res.json(result);
});

// GET /api/plans/:id
router.get("/plans/:id", (req: Request, res: Response) => {
  const plan = getPlanById(req.params.id);
  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }
  const sessions = getSessionsByPlanId(plan.id);
  res.json(mapPlanRow(plan, sessions));
});

// POST /api/generate-plan
router.post("/generate-plan", async (req: Request, res: Response) => {
  const { goal, fitnessLevel, daysPerWeek, dietaryPref } = req.body;

  if (!goal || !fitnessLevel || !daysPerWeek || !dietaryPref) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  try {
    const planSchema = z.object({
      name: z.string().describe("A motivating, personalized fitness plan name"),
      description: z
        .string()
        .describe("A short, engaging description of the plan and what the user will achieve"),
      sessions: z
        .array(
          z.object({
            title: z
              .string()
              .describe(
                "Session title e.g. 'Day 1 – Upper Body Strength' or 'Rest Day – Active Recovery'"
              ),
            description: z
              .string()
              .describe("Brief overview of what this session covers (workout focus + diet theme)"),
          })
        )
        .describe(`Exactly ${daysPerWeek} sessions, one per training day`),
    });

    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
      schema: planSchema,
      prompt: `Create a personalised fitness plan for someone with the following profile:
- Goal: ${goal}
- Fitness Level: ${fitnessLevel}
- Training Days per Week: ${daysPerWeek}
- Dietary Preference: ${dietaryPref}

Generate exactly ${daysPerWeek} training sessions that are logically sequenced for the week.
Ensure the plan name is motivating and the description is inspiring.
Each session title should indicate the day number and focus area.`,
    });

    const planId = crypto.randomUUID();
    const plan: PlanRow = {
      id: planId,
      name: object.name,
      goal,
      fitness_level: fitnessLevel,
      days_per_week: daysPerWeek,
      dietary_pref: dietaryPref,
      description: object.description,
      created_at: Date.now(),
    };

    insertPlan(plan);

    const sessions = object.sessions.map((s, index) => {
      const sessionId = crypto.randomUUID();
      const sessionRow = {
        id: sessionId,
        plan_id: planId,
        title: s.title,
        description: s.description,
        sort_order: index,
      };
      insertSession(sessionRow);
      return {
        ...sessionRow,
        is_completed: 0,
        quiz_score: null,
        workout_content: null,
        diet_content: null,
        quiz: null,
      } as SessionRow;
    });

    res.json(mapPlanRow(plan, sessions));
  } catch (error) {
    console.error("Error generating plan:", error);
    res.status(500).json({ error: "Failed to generate plan" });
  }
});

// POST /api/stream-session
router.post("/stream-session", async (req: Request, res: Response) => {
  const { planId, sessionId, planName, goal, fitnessLevel, dietaryPref, sessionTitle, sessionDescription } =
    req.body;

  if (!planId || !sessionId || !planName || !sessionTitle || !sessionDescription) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const prompt = `You are an expert personal trainer and certified nutritionist. You are creating content for the session "${sessionTitle}" from the fitness plan "${planName}".

Session Overview: ${sessionDescription}
User Goal: ${goal}
Fitness Level: ${fitnessLevel}
Dietary Preference: ${dietaryPref}

PART 1: WORKOUT PLAN
Structure your workout in valid Markdown:
- **Warm-Up** (5-10 min): List exercises with duration/reps
- **Main Workout**: List exercises with sets, reps, rest time. Use tables where appropriate.
- **Cool-Down** (5-10 min): Stretching routine
- Include form tips and modifications for ${fitnessLevel} level
- Add motivational coaching cues

After the workout, output this separator EXACTLY: "---DIET_START---"

PART 2: MEAL PLAN
Immediately after the separator, write a Markdown meal plan for this training day:
- **Pre-Workout Meal** (what to eat 1-2h before)
- **Post-Workout Meal** (within 30-60 min after)
- **Full Day Meal Plan**: Breakfast, Lunch, Dinner, Snacks
- Include approximate macros (protein/carbs/fat)
- Respect the dietary preference: ${dietaryPref}
- Keep it practical and delicious

After the diet plan, output this separator EXACTLY: "---QUIZ_START---"

PART 3: QUIZ
Immediately after, provide a valid JSON array of 4 multiple-choice questions about fitness or nutrition related to this session.
Do NOT wrap in markdown code blocks. Just raw JSON.

JSON format per question:
{
  "question": "string",
  "options": ["string", "string", "string", "string"],
  "correctAnswer": number (0-3 index),
  "explanation": "string"
}

Tone: Energetic, motivating, and professional.`;

  try {
    const result = streamText({
      model: google("gemini-2.5-flash"),
      prompt,
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();

    let fullText = "";

    for await (const chunk of result.textStream) {
      fullText += chunk;
      res.write(chunk);
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    }

    res.end();

    // Parse and save to DB after streaming
    const DIET_SEP = "---DIET_START---";
    const QUIZ_SEP = "---QUIZ_START---";

    const dietIdx = fullText.indexOf(DIET_SEP);
    const quizIdx = fullText.indexOf(QUIZ_SEP);

    const workoutText = dietIdx !== -1 ? fullText.slice(0, dietIdx) : fullText;
    const dietText =
      dietIdx !== -1 && quizIdx !== -1
        ? fullText.slice(dietIdx + DIET_SEP.length, quizIdx)
        : dietIdx !== -1
        ? fullText.slice(dietIdx + DIET_SEP.length)
        : "";

    let quizData: any[] = [];
    if (quizIdx !== -1) {
      try {
        const jsonString = fullText
          .slice(quizIdx + QUIZ_SEP.length)
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
        quizData = JSON.parse(jsonString);
      } catch (e) {
        console.error("Failed to parse quiz JSON:", e);
      }
    }

    updateSessionContent(sessionId, workoutText, dietText, JSON.stringify(quizData));
  } catch (error) {
    console.error("Error streaming session:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream session" });
    } else {
      res.end();
    }
  }
});

// PUT /api/sessions/:id/quiz-score
router.put("/sessions/:id/quiz-score", (req: Request, res: Response) => {
  const { score, isCompleted } = req.body;
  if (typeof score !== "number" || typeof isCompleted !== "boolean") {
    res.status(400).json({ error: "score (number) and isCompleted (boolean) are required" });
    return;
  }
  updateSessionQuizScore(req.params.id, score, isCompleted);
  res.json({ success: true });
});

// DELETE /api/plans/:id
router.delete("/plans/:id", (req: Request, res: Response) => {
  deletePlan(req.params.id);
  res.json({ success: true });
});

export default router;
