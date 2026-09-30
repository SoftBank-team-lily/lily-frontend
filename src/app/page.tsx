import { LandingPage } from "@/components/landing/LandingPage";
import { AuthNav } from "@/components/auth/AuthNav";
import { getUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getUser();
  return (
    <LandingPage
      key={user?.id ?? "guest"}
      navigation={<AuthNav user={user} />}
    />
  );
}
