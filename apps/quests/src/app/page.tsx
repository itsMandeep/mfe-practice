import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/quests/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <main style={{ padding: 32, fontFamily: "sans-serif" }}>
          <h1>🗺️ Quests app (owns /quests)</h1>
          <p>Third independently deployable zone.</p>
        </main>
      </main>
    </div>
  );
}
