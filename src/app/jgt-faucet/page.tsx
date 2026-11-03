import { permanentRedirect } from "next/navigation";

export default function RetiredFaucetRoute(): never {
  permanentRedirect("/");
}
