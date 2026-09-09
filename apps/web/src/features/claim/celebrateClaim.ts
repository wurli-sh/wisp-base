import confetti from "canvas-confetti";

export function celebrateClaim() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  void confetti({
    particleCount: 60,
    spread: 55,
    origin: { y: 0.65 },
    colors: ["#2c5cc5", "#4674d2", "#171a20", "#ffffff"],
  });
}
