import Link from "next/link";

export default function Profile() {
  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>👤 Gamer profile</h1>
      <p>URL should be /gamer/profile</p>
      <Link href="/">← Gamer home</Link>
    </main>
  );
}
