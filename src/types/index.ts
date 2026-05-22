export type FitnessLevel = 'beginner' | 'some_experience' | 'experienced' | 'advanced';
export type GoalCategory =
  | 'build_muscle'
  | 'lose_fat'
  | 'specific_activity'
  | 'rehab'
  | 'general_fitness';
export type InjurySeverity = 'cautious' | 'active_pain' | 'avoid';
export type FeltRating = 'easy' | 'just_right' | 'hard';
export type SubscriptionTier = 'free' | 'premium';

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  sex: 'male' | 'female';
  height_cm: number;
  weight_kg: number;
  fitness_level: FitnessLevel;
  onboarding_complete: boolean;
  subscription_tier: SubscriptionTier;
  weight_unit: 'kg' | 'lbs';
}

export interface Injury {
  id: string;
  body_part: string;
  severity: InjurySeverity;
  notes?: string;
}

export interface SchedulePrefs {
  days_per_week: number;
  minutes_per_session: number;
  preferred_time: 'morning' | 'lunch' | 'evening' | 'flexible';
}

export interface Goal {
  id: string;
  category: GoalCategory;
  specific_activity?: string;
  target_weeks: number;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  muscles_primary: string[];
  muscles_secondary: string[];
  equipment_required: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  setup_cues: string[];
  execution_cues: string[];
  common_mistakes: string[];
  video_url?: string;
  contraindications: string[];
}

export interface WorkoutExercise {
  id: string;
  exercise: Exercise;
  target_sets: number;
  target_reps: string;
  target_rpe: number;
  rest_seconds: number;
  notes?: string;
  order: number;
}

export interface Workout {
  id: string;
  name: string;
  focus: string;
  estimated_duration_min: number;
  exercises: WorkoutExercise[];
  week_number: number;
  day_number: number;
}

export interface SessionSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  rpe?: number;
  form_score?: number;
  completed_at: string;
}

export interface Session {
  id: string;
  workout_id: string;
  started_at: string;
  completed_at?: string;
  felt_rating?: FeltRating;
  sets: SessionSet[];
}

export interface SocialPost {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  session_id: string;
  workout_name: string;
  duration_min: number;
  exercise_count: number;
  felt_rating: FeltRating;
  caption?: string;
  likes: number;
  liked_by_me: boolean;
  created_at: string;
}

export interface Challenge {
  id: string;
  name: string;
  description: string;
  ends_at: string;
  participants: number;
  my_rank?: number;
  my_progress: number;
  target: number;
}

export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'program' | 'subscription_monthly' | 'subscription_yearly';
  duration_label?: string;
  tag?: string;
}

export type RootStackParamList = {
  Intro: undefined;
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  SignUp: undefined;
  Login: undefined;
};

export type OnboardingStackParamList = {
  ProfileBasics: undefined;
  Injuries: undefined;
  Schedule: undefined;
  Equipment: undefined;
  Goals: undefined;
  GeneratingPlan: undefined;
};

export type MainTabParamList = {
  Today: undefined;
  Progress: undefined;
  Social: undefined;
  Store: undefined;
  Profile: undefined;
};

export type TodayStackParamList = {
  TodayHome: undefined;
  WorkoutSession: { workoutId: string };
  ExerciseDetail: { exerciseId: string; workoutId?: string; workoutExerciseId?: string };
  SubstituteExercise: { exerciseId: string; workoutId: string; workoutExerciseId: string };
  FormCoach: { exerciseId: string; exerciseName: string };
  WorkoutComplete: { sessionId: string };
};

export interface ExerciseDBExercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string[];
  description: string;
  difficulty: string;
  category: string;
}

export type SubstituteSource = 'local' | 'exercisedb';

export interface SubstituteOption {
  source: SubstituteSource;
  localExercise?: Exercise;
  dbExercise?: ExerciseDBExercise;
  isEquipmentCompatible: boolean;
  isInjurySafe: boolean;
  id: string;
  name: string;
  equipment: string;
  difficulty: string;
  muscles: string;
}
