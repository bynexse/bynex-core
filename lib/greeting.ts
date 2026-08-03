export function getRealtimeGreeting(hour: number) {
  if (hour >= 5 && hour < 10) return "God morgon";
  if (hour >= 10 && hour < 13) return "God förmiddag";
  if (hour >= 13 && hour < 17) return "God eftermiddag";
  if (hour >= 17 && hour < 22) return "God kväll";
  return "God natt";
}
