import { AuthForm } from "./AuthForm";
export function SignupForm({ next }: { next: string }) {
  return <AuthForm mode="signup" next={next} />;
}
