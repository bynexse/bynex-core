"use client";

import { useEffect, useState } from "react";

type GreetingProps = {
  name?: string;
};

function getGreeting(hour: number) {
  if (hour >= 5 && hour < 10) {
    return "God morgon";
  }

  if (hour >= 10 && hour < 13) {
    return "God förmiddag";
  }

  if (hour >= 13 && hour < 17) {
    return "God eftermiddag";
  }

  if (hour >= 17 && hour < 22) {
    return "God kväll";
  }

  return "God natt";
}

export default function Greeting({
  name = "Christoffer",
}: GreetingProps) {
  const [greeting, setGreeting] = useState("Välkommen");
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    function updateGreeting() {
      const now = new Date();

      setGreeting(getGreeting(now.getHours()));

      setCurrentTime(
        new Intl.DateTimeFormat("sv-SE", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }).format(now)
      );
    }

    updateGreeting();

    const interval = window.setInterval(updateGreeting, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div>
      <p className="text-sm font-medium text-white/65">
        {currentTime || "Laddar aktuell tid…"}
      </p>

      <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-5xl">
        {greeting}, {name}
      </h1>
    </div>
  );
}