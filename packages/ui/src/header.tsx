type Zone = "home" | "gamer" | "quests" | "upcoming";

const zones: { id: Zone; label: string; href: string }[] = [
  { id: "home", label: "🏠 Home", href: "/" },
  { id: "gamer", label: "🎮 Gamer", href: "/gamer" },
  { id: "quests", label: "🗺️ Quests", href: "/quests" },
];

export function Header({ current }: { current: Zone }) {
  return (
    <header
      style={{
        display: "flex",
        gap: 20,
        padding: "12px 32px",
        background: "#111",
        fontFamily: "sans-serif",
      }}
    >
      {zones.map((z) => (
        // Plain <a>: every link here may cross zones → full page load
        <a
          key={z.id}
          href={z.href}
          style={{
            color: z.id === current ? "#4ade80" : "#fff",
            fontWeight: z.id === current ? 700 : 400,
            textDecoration: "none",
          }}
        >
          {z.label}
        </a>
      ))}
      <span style={{ marginLeft: "auto", color: "#888", fontSize: 12 }}>
        served by: {current} app
      </span>
    </header>
  );
}
