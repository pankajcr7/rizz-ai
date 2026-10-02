import { router } from "expo-router";
import { TERMS_SECTIONS, POLICY_UPDATED } from "@rizz/shared";
import { Header, IconButton, Screen, Section, T } from "../components/ui";

export default function Terms() {
  return <Screen>
    <Header title="Terms of use" subtitle={`Updated ${POLICY_UPDATED}`} left={<IconButton name="chevron-back" label="Back" onPress={() => router.back()} />} />
    {TERMS_SECTIONS.map((section) => <Section key={section.title} title={section.title}><T>{section.body}</T></Section>)}
  </Screen>;
}
