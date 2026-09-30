import { AuthForm } from "./AuthForm";
export function LoginForm({ next }: { next: string }) {
  return <AuthForm mode="login" next={next} />;
}
