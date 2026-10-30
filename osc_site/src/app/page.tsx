import messages from "../../messages/en.json";

export default function HomePage() {
  return (
    <main>
      <h1>{messages.landing.title}</h1>
      <p>{messages.landing.description}</p>
    </main>
  );
}
