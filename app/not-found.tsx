import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "4rem 1.5rem", textAlign: "center" }}>
      <h1>404</h1>
      <p>Page not found.</p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
