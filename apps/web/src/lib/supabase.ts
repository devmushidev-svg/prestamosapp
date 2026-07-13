import { createClient } from "@supabase/supabase-js";

// Llaves del proyecto. La anon key es pública por diseño: el acceso real lo
// controla RLS en Supabase. Los valores fijos son respaldo para que el build
// de Vercel funcione aunque no se configuren variables VITE_* en el panel.
const url = import.meta.env.VITE_SUPABASE_URL || "https://jblpeajvgqtsbnghbfch.supabase.co";
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibHBlYWp2Z3F0c2JuZ2hiZmNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4OTk4NTMsImV4cCI6MjA5OTQ3NTg1M30.HUoCzUSZFzGL05bhjie102VYF_ugKKcVVK7cBTQ92sY";

export const supabase = createClient(url, anonKey);
