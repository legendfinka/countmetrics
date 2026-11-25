import { Logo } from "./logo";
import { Loading } from "./ui/alert";

/** The first screen, shown while we check if the user is logged in. */
export function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <Logo size={64} className="animate-pulse" />
      <Loading />
    </div>
  );
}
