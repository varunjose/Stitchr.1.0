import Builder from "./builder";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Builder demo={process.env.REQUIREMENTS_MODE === "demo"} />;
}
