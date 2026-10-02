import { router } from "expo-router";
import { PRIVACY_SECTIONS, POLICY_UPDATED } from "@rizz/shared";
import { Header, IconButton, Screen, Section, T } from "../components/ui";

export default function Privacy() {
  return <Screen>
    <Header title="Privacy policy" subtitle={`Updated ${POLICY_UPDATED}`} left={<IconButton name="chevron-back" label="Back" onPress={() => router.back()} />} />
    {PRIVACY_SECTIONS.map((section) => <Section key={section.title} title={section.title}><T>{section.body}</T></Section>)}
  </Screen>;
}
