import Image from "next/image";
import styles from "./page.module.css";
import Link from "next/dist/client/link";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <Image
          className={styles.logo}
          src="/gamer/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className={styles.intro}>
          <h1>🎮 Gamer app (owns /gamer)</h1>

          {/* Inside the same zone → next/link. Note: href is "/profile", NOT "/gamer/profile".
          basePath is prepended automatically. */}
          <Link href="/profile">My profile (client-side nav)</Link>

          <br />
          <br />

          {/* Leaving the zone → plain <a>, full page load */}
          <a href="/">← Back to Home app</a>
        </div>
      </main>
    </div>
  );
}
