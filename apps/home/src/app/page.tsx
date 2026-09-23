import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <section className={styles.navLinks}>
          <h1>🏠 Home app (owns /)</h1>
          <p>This is the shell / landing zone.</p>
          <nav style={{ display: "flex", gap: 16 }}>
            {/* Plain <a>, not next/link: crossing zones = full page load */}
            <a href="/gamer">Go to Gamer →</a>
            <a href="/quests">Go to Quests →</a>
          </nav>
        </section>
      </main>
    </div>
  );
}
