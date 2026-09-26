import { Redirect } from "expo-router";

// The centre tab is an action button (see _layout.tsx); this route is never shown.
export default function Scan() {
  return <Redirect href="/" />;
}
