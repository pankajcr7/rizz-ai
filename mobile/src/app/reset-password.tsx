import { router } from "expo-router";
import { useState } from "react";
import { account, errorMessage } from "../api/client";
import { Button, Header, IconButton, Input, Notice, Screen, T } from "../components/ui";
import { colors, space } from "../theme";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setError(undefined);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (sent && (!/^\d{8}$/.test(code) || password.length < 10 || password.length > 128 || password !== confirm)) return setError("Enter the 8-digit code and matching passwords of 10–128 characters.");
    setBusy(true);
    try {
      if (!sent) { await account.requestReset(email.trim().toLowerCase()); setSent(true); }
      else { await account.confirmReset(email.trim().toLowerCase(), code, password); setDone(true); }
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return <Screen footer={<Button title={done ? "Back to log in" : sent ? "Reset password" : "Send reset code"} loading={busy} onPress={() => done ? router.back() : void submit()} />}>
    <Header title="Reset password" left={<IconButton name="chevron-back" label="Back" onPress={() => router.back()} />} />
    {done ? <Notice text="Password updated. Log in with your new password. Your other sessions have been signed out." tone="success" /> : <>
      <T v="body" color={colors.textDim} style={{ marginBottom: space(4) }}>{sent ? "If this email has an account, a code is on its way. Check your inbox and spam folder. It expires in 15 minutes." : "We'll send a one-time code to your account email."}</T>
      <Input accessibilityLabel="Account email" value={email} onChangeText={setEmail} editable={!sent} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      {sent ? <>
        <Input accessibilityLabel="8-digit reset code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 8))} placeholder="8-digit code" keyboardType="number-pad" maxLength={8} style={{ marginTop: space(4) }} />
        <Input accessibilityLabel="New password" value={password} onChangeText={setPassword} placeholder="New password · at least 10 characters" secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={128} style={{ marginTop: space(4) }} />
        <Input accessibilityLabel="Confirm new password" value={confirm} onChangeText={setConfirm} placeholder="Confirm new password" secureTextEntry autoCapitalize="none" maxLength={128} style={{ marginTop: space(4) }} />
        <Button title="Request a new code or change email" size="sm" variant="ghost" onPress={() => { setSent(false); setCode(""); setError(undefined); }} style={{ marginTop: space(3) }} />
      </> : null}
      {error ? <Notice text={error} /> : null}
    </>}
  </Screen>;
}
